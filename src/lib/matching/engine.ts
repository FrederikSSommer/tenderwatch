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
// Set low (5) so any CPV or keyword signal at all passes through to Claude.
const STAGE1_THRESHOLD = 5

// Maximum number of Stage-1 candidates per profile that get sent to Claude
// per run. Raised to 120 to give Claude more to work with.
const AI_FILTER_CAP = 120

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

  // Fetch ALL tenders since the date. Supabase defaults to 1000 rows, so
  // we paginate to ensure we get everything.
  const sinceStr = since.toISOString().split('T')[0]
  const allTenders: Database['public']['Tables']['tenders']['Row'][] = []
  const PAGE_SIZE = 1000
  let offset = 0
  let fetchMore = true
  while (fetchMore) {
    const { data, error } = await supabase
      .from('tenders')
      .select('*')
      .gte('publication_date', sinceStr)
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) {
      console.error('Failed to fetch tenders:', error)
      return []
    }
    if (!data || data.length === 0) break
    allTenders.push(...data)
    offset += data.length
    fetchMore = data.length === PAGE_SIZE
  }
  const tenders = allTenders

  if (tenders.length === 0) {
    console.log('[matching] No tenders found since', sinceStr)
    return []
  }
  console.log(`[matching] Fetched ${tenders.length} tenders since ${sinceStr}`)

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
  // Batch the query to avoid hitting PostgREST URL length limits with 3000+ IDs
  const profileIds = profiles.map(p => p.id)
  const tenderIds = tenders.map(t => t.id)
  const seen = new Set<string>()
  const CACHE_BATCH = 500
  for (let i = 0; i < tenderIds.length; i += CACHE_BATCH) {
    const batch = tenderIds.slice(i, i + CACHE_BATCH)
    const { data: existing } = await supabase
      .from('matches')
      .select('profile_id, tender_id')
      .in('profile_id', profileIds)
      .in('tender_id', batch)
    for (const r of existing || []) seen.add(`${r.profile_id}::${r.tender_id}`)
  }
  console.log(`[matching] Cache: ${seen.size} existing pairs will be skipped`)

  const userIds = [...new Set(profiles.map(p => p.user_id))]
  const learnedByUser = await fetchLearnedSignalsByUser(supabase, userIds)

  // Stage 1: cheap candidate generation
  const candidatesByProfile = new Map<string, RerankCandidate[]>()
  let totalPairs = 0
  let skippedCache = 0
  let belowThreshold = 0
  const scoreDistribution: Record<string, number> = { '0': 0, '1-9': 0, '10-19': 0, '20-29': 0, '30-39': 0, '40+': 0 }

  for (const tender of tenders) {
    for (const profile of profiles) {
      totalPairs++
      if (seen.has(`${profile.id}::${tender.id}`)) { skippedCache++; continue }
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

      // Track score distribution for diagnostics
      if (result.score === 0) scoreDistribution['0']++
      else if (result.score < 10) scoreDistribution['1-9']++
      else if (result.score < 20) scoreDistribution['10-19']++
      else if (result.score < 30) scoreDistribution['20-29']++
      else if (result.score < 40) scoreDistribution['30-39']++
      else scoreDistribution['40+']++

      if (result.score < STAGE1_THRESHOLD) { belowThreshold++; continue }

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

  const totalStage1Pass = [...candidatesByProfile.values()].reduce((s, c) => s + c.length, 0)
  console.log('[matching] Stage 1 diagnostics:', {
    totalTenders: tenders.length,
    totalProfiles: profiles.length,
    totalPairs,
    skippedCache,
    belowThreshold,
    passedStage1: totalStage1Pass,
    scoreDistribution,
  })
  // Log profile details for debugging
  for (const profile of profiles) {
    console.log(`[matching] Profile "${profile.name}":`, {
      cpv_codes: profile.cpv_codes?.slice(0, 5),
      keywords: profile.keywords?.slice(0, 8),
      countries: profile.countries,
    })
  }
  // Log sample tenders for debugging
  if (tenders.length > 0) {
    const sample = tenders.slice(0, 3)
    for (const t of sample) {
      console.log(`[matching] Sample tender "${t.title.slice(0, 60)}":`, {
        cpv_codes: t.cpv_codes?.slice(0, 5),
        buyer_country: t.buyer_country,
      })
    }
  }

  // Stage 2: AI rerank per profile (capped)
  const matches: MatchResult[] = []
  for (const [profileId, candidates] of candidatesByProfile) {
    candidates.sort((a, b) => b.stage1_score - a.stage1_score)
    const topN = candidates.slice(0, AI_FILTER_CAP)
    console.log(`[matching] Stage 2: profile ${profileId} — ${candidates.length} candidates, sending top ${topN.length} to Claude`)
    if (topN.length > 0) {
      console.log(`[matching] Top 5 Stage-1 candidates:`, topN.slice(0, 5).map(c => ({
        title: c.tender.title.slice(0, 60),
        score: c.stage1_score,
        cpv: c.matched_cpv.slice(0, 3),
        kw: c.matched_keywords.slice(0, 3),
      })))
    }
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
    console.log(`[matching] Claude rerank returned ${aiScores.size} accepted tenders`)
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
