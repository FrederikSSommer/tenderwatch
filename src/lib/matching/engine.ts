import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  calculateRelevance,
  extractLearnedKeywords,
  LearnedSignals,
  ScoreResult,
} from '@/lib/ai/relevance-score'
import Anthropic from '@anthropic-ai/sdk'

export interface MatchResult {
  tender_id: string
  profile_id: string
  user_id: string
  relevance_score: number
  matched_cpv: string[]
  matched_keywords: string[]
}

// Stage-1 (cheap) keyword/CPV threshold. The Stage-2 Claude rerank is the
// real arbiter — Stage 1 just trims the candidate pool before AI cost.
const STAGE1_THRESHOLD = 35

// Maximum number of Stage-1 candidates per profile that get sent to Claude
// per run. Caps cost at ~4 batches × $0.024 ≈ $0.10 per profile per call.
const AI_FILTER_CAP = 60

// Batch size when calling Claude for relevance scoring
const AI_BATCH_SIZE = 30

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

type SupabaseSrv = SupabaseClient<Database>

// Default to a service-role client when no client is injected. The matching
// engine needs to read across users (cron) or score against any tender
// regardless of RLS, so anon access isn't enough.
function getDefaultClient(): SupabaseSrv {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Build per-user learned signals from each user's subscribed (bookmarked) tenders.
// These bias future scoring toward patterns the user has shown interest in.
async function fetchLearnedSignalsByUser(
  supabase: SupabaseSrv,
  userIds: string[]
): Promise<Map<string, LearnedSignals>> {
  const out = new Map<string, LearnedSignals>()
  if (userIds.length === 0) return out

  const { data, error } = await supabase
    .from('matches')
    .select('user_id, tender:tenders(title, cpv_codes)')
    .in('user_id', userIds)
    .eq('bookmarked', true)

  if (error || !data) return out

  const byUser = new Map<string, { titles: string[]; cpvs: string[] }>()
  for (const row of data as Array<{
    user_id: string
    tender: { title: string | null; cpv_codes: string[] | null } | null
  }>) {
    const t = row.tender
    if (!t) continue
    const bucket = byUser.get(row.user_id) || { titles: [], cpvs: [] }
    if (t.title) bucket.titles.push(t.title)
    if (Array.isArray(t.cpv_codes)) bucket.cpvs.push(...t.cpv_codes)
    byUser.set(row.user_id, bucket)
  }

  for (const [uid, b] of byUser) {
    const cpvCounts = new Map<string, number>()
    for (const c of b.cpvs) cpvCounts.set(c, (cpvCounts.get(c) || 0) + 1)
    const recurringCpvs = [...cpvCounts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([c]) => c)
    out.set(uid, {
      cpv_codes: recurringCpvs.length > 0 ? recurringCpvs : [...new Set(b.cpvs)].slice(0, 20),
      keywords: extractLearnedKeywords(b.titles),
    })
  }
  return out
}

interface RerankCandidate {
  tender_id: string
  profile_id: string
  user_id: string
  stage1_score: number
  matched_cpv: string[]
  matched_keywords: string[]
  tender: {
    id: string
    title: string
    description: string | null
    buyer_name: string | null
    buyer_country: string | null
    cpv_codes: string[]
  }
}

interface ProfileSnapshot {
  id: string
  name: string | null
  keywords: string[]
  cpv_codes: string[]
  exclude_keywords: string[]
}

// Stage-2: Claude rerank — strict literal-match prompt mirroring the wizard.
// Returns AI scores by candidate index.
async function aiRerank(
  profile: ProfileSnapshot,
  candidates: RerankCandidate[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (candidates.length === 0) return out

  const profileSnapshot =
    `Name: ${profile.name || 'monitoring profile'}\n` +
    `Topic keywords: ${profile.keywords.slice(0, 12).join(', ') || '(none)'}\n` +
    `CPV codes (8-digit): ${profile.cpv_codes.slice(0, 12).join(', ') || '(none)'}\n` +
    `Excluded terms: ${profile.exclude_keywords.join(', ') || '(none)'}`

  for (let offset = 0; offset < candidates.length; offset += AI_BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + AI_BATCH_SIZE)
    const prompt = `You are evaluating which public tenders are actually relevant to a buyer's monitoring profile.

PROFILE
${profileSnapshot}

Be STRICT and LITERAL. Match the actual product or service the profile would buy or sell, not just shared sectors. Examples of WRONG matches:
- a shipbuilding profile with workwear, hand guns, or canteen catering tenders
- a software/IT profile with office furniture or printer toner
- a road construction profile with traffic-light bulbs
A weak buyer/CPV overlap is NOT enough — the actual subject of the tender must align with the profile.

CANDIDATES (numbered)
${batch.map((c, i) => `[${i}] "${c.tender.title}"
   Buyer: ${c.tender.buyer_name || '?'}${c.tender.buyer_country ? ` (${c.tender.buyer_country})` : ''}
   CPV: ${(c.tender.cpv_codes || []).slice(0, 6).join(', ') || 'none'}
   ${c.tender.description ? c.tender.description.slice(0, 220) : ''}`).join('\n\n')}

Return ONLY a JSON array. Include ONLY entries scoring 5 or higher (0-10 scale). Format:
[{"i": 0, "score": 9}, {"i": 3, "score": 7}, ...]`

    try {
      const msg = await getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '[' },
        ],
      })
      const text = msg.content[0].type === 'text' ? '[' + msg.content[0].text : '[]'
      const m = text.match(/\[[\s\S]*?\]/)
      if (!m) continue
      const scored: { i: number; score: number }[] = JSON.parse(m[0])
      for (const s of scored) {
        if (typeof s.i !== 'number' || s.score < 5) continue
        if (s.i < 0 || s.i >= batch.length) continue
        out.set(batch[s.i].tender_id, s.score)
      }
    } catch (err) {
      console.error('AI rerank batch failed:', err)
      // On failure, accept the Stage-1 candidates as-is for this batch
      for (const c of batch) out.set(c.tender_id, 6)
    }
  }
  return out
}

export interface MatchOptions {
  /**
   * Restrict matching to a single user's profiles. Used by the manual
   * backfill route. When omitted, scores against ALL active profiles
   * (used by the daily cron).
   */
  userId?: string
  /**
   * Optional Supabase client. Defaults to a fresh service-role client.
   */
  supabase?: SupabaseSrv
}

/**
 * Score tenders published since `since` against monitoring profiles.
 *
 * Pipeline:
 *   1. Pull tenders from the shared `tenders` table (filled by ingest cron)
 *   2. Stage-1: cheap keyword/CPV scoring → drop pairs below threshold
 *   3. Cache check: skip (profile, tender) pairs already in `matches`
 *   4. Stage-2: Claude rerank with strict literal-match prompt
 *   5. Persist new matches with blended score (60% AI × 10 + 40% Stage-1)
 */
export async function matchNewTenders(
  since: Date,
  opts: MatchOptions = {}
): Promise<MatchResult[]> {
  const supabase = opts.supabase ?? getDefaultClient()

  const { data: tenders, error: tErr } = await supabase
    .from('tenders')
    .select('*')
    .gte('publication_date', since.toISOString().split('T')[0])

  if (tErr || !tenders || tenders.length === 0) {
    if (tErr) console.error('Failed to fetch tenders:', tErr)
    return []
  }

  let profileQuery = supabase
    .from('monitoring_profiles')
    .select('*')
    .eq('active', true)
  if (opts.userId) profileQuery = profileQuery.eq('user_id', opts.userId)

  const { data: profiles, error: pErr } = await profileQuery
  if (pErr || !profiles || profiles.length === 0) {
    if (pErr) console.error('Failed to fetch profiles:', pErr)
    return []
  }

  // Cache: skip (profile, tender) pairs already evaluated
  const profileIds = profiles.map(p => p.id)
  const tenderIds = tenders.map(t => t.id)
  const { data: existing } = await supabase
    .from('matches')
    .select('profile_id, tender_id')
    .in('profile_id', profileIds)
    .in('tender_id', tenderIds)

  const seen = new Set<string>()
  for (const r of existing || []) seen.add(`${r.profile_id}::${r.tender_id}`)

  const userIds = [...new Set(profiles.map(p => p.user_id))]
  const learnedByUser = await fetchLearnedSignalsByUser(supabase, userIds)

  // Stage 1: cheap candidate generation
  const candidatesByProfile = new Map<string, RerankCandidate[]>()
  for (const tender of tenders) {
    for (const profile of profiles) {
      if (seen.has(`${profile.id}::${tender.id}`)) continue
      const result: ScoreResult = calculateRelevance(
        {
          cpv_codes: tender.cpv_codes,
          title: tender.title,
          description: tender.description,
          buyer_country: tender.buyer_country,
          estimated_value_eur: tender.estimated_value_eur,
        },
        {
          cpv_codes: profile.cpv_codes,
          keywords: profile.keywords,
          exclude_keywords: profile.exclude_keywords,
          countries: profile.countries,
          min_value_eur: profile.min_value_eur,
          max_value_eur: profile.max_value_eur,
        },
        learnedByUser.get(profile.user_id)
      )
      if (result.score < STAGE1_THRESHOLD) continue

      const list = candidatesByProfile.get(profile.id) || []
      list.push({
        tender_id: tender.id,
        profile_id: profile.id,
        user_id: profile.user_id,
        stage1_score: result.score,
        matched_cpv: result.matched_cpv,
        matched_keywords: result.matched_keywords,
        tender: {
          id: tender.id,
          title: tender.title,
          description: tender.description,
          buyer_name: tender.buyer_name,
          buyer_country: tender.buyer_country,
          cpv_codes: tender.cpv_codes,
        },
      })
      candidatesByProfile.set(profile.id, list)
    }
  }

  // Stage 2: AI rerank per profile (capped)
  const matches: MatchResult[] = []
  for (const [profileId, candidates] of candidatesByProfile) {
    candidates.sort((a, b) => b.stage1_score - a.stage1_score)
    const topN = candidates.slice(0, AI_FILTER_CAP)
    const profile = profiles.find(p => p.id === profileId)!
    const aiScores = await aiRerank(
      {
        id: profile.id,
        name: profile.name,
        keywords: profile.keywords || [],
        cpv_codes: profile.cpv_codes || [],
        exclude_keywords: profile.exclude_keywords || [],
      },
      topN
    )
    for (const c of topN) {
      const ai = aiScores.get(c.tender_id)
      if (ai === undefined) continue
      const blended = Math.min(100, Math.round(ai * 6 + c.stage1_score * 0.4))
      matches.push({
        tender_id: c.tender_id,
        profile_id: c.profile_id,
        user_id: c.user_id,
        relevance_score: blended,
        matched_cpv: c.matched_cpv,
        matched_keywords: c.matched_keywords,
      })
    }
  }

  if (matches.length > 0) {
    const { error } = await supabase.from('matches').upsert(
      matches.map(m => ({
        tender_id: m.tender_id,
        profile_id: m.profile_id,
        user_id: m.user_id,
        relevance_score: m.relevance_score,
        matched_cpv: m.matched_cpv,
        matched_keywords: m.matched_keywords,
      })),
      { onConflict: 'tender_id,profile_id' }
    )
    if (error) console.error('Failed to upsert matches:', error)
  }

  return matches
}
