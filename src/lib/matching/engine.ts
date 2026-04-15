import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { extractLearnedKeywords, LearnedSignals } from '@/lib/ai/relevance-score'
import { scoreAndRerank, MatchingTender } from './core'

export interface MatchResult {
  tender_id: string
  profile_id: string
  user_id: string
  relevance_score: number
  matched_cpv: string[]
  matched_keywords: string[]
  ai_reason: string | null
}

// Stage-1 threshold: any CPV or keyword signal passes through to Claude.
// Claude is the real arbiter — Stage 1 just trims the candidate pool.
const STAGE1_THRESHOLD = 5
// Maximum Stage-1 survivors per profile sent to Claude per run.
const AI_FILTER_CAP = 120
// Claude batch size.
const AI_BATCH_SIZE = 30

type SupabaseSrv = SupabaseClient<Database>

// Default to a service-role client when no client is injected. The matching
// engine reads across users (cron) or scores any tender regardless of RLS,
// so anon access isn't enough.
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

// Fetch followed tender titles per user — fed to Claude as positive examples.
async function fetchFollowedTitlesByUser(
  supabase: SupabaseSrv,
  userIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (userIds.length === 0) return out

  const { data } = await supabase
    .from('matches')
    .select('user_id, tender:tenders(title)')
    .in('user_id', userIds)
    .eq('bookmarked', true)

  if (!data) return out

  for (const row of data as Array<{
    user_id: string
    tender: { title: string | null } | null
  }>) {
    if (!row.tender?.title) continue
    const list = out.get(row.user_id) || []
    list.push(row.tender.title)
    out.set(row.user_id, list)
  }
  return out
}

// Fetch dismissed tender titles per user — fed to Claude as negative examples.
async function fetchDismissedTitlesByUser(
  supabase: SupabaseSrv,
  userIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (userIds.length === 0) return out

  const { data } = await supabase
    .from('matches')
    .select('user_id, tender:tenders(title)')
    .in('user_id', userIds)
    .eq('dismissed', true)

  if (!data) return out

  for (const row of data as Array<{
    user_id: string
    tender: { title: string | null } | null
  }>) {
    if (!row.tender?.title) continue
    const list = out.get(row.user_id) || []
    list.push(row.tender.title)
    out.set(row.user_id, list)
  }
  return out
}

export interface MatchOptions {
  /**
   * Restrict matching to a single user's profiles. Used by the manual
   * backfill route. When omitted, scores against ALL active profiles
   * (daily cron).
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
 * Pipeline (orchestration + persistence only — scoring delegates to
 * `src/lib/matching/core.ts` so the wizard can reuse the same logic):
 *   1. Pull tenders from the shared `tenders` table (filled by ingest cron)
 *   2. Cache check: skip (profile, tender) pairs already in `matches`
 *   3. Per profile: call `scoreAndRerank` with user history + learned signals
 *   4. Persist results
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

  // Cache: skip (profile, tender) pairs that already have a complete match
  // (i.e. have an ai_reason). Matches missing ai_reason get re-evaluated.
  // Batch the query to avoid hitting PostgREST URL length limits with 3000+ IDs.
  const profileIds = profiles.map(p => p.id)
  const tenderIds = tenders.map(t => t.id)
  const seen = new Set<string>()
  const CACHE_BATCH = 500
  for (let i = 0; i < tenderIds.length; i += CACHE_BATCH) {
    const batch = tenderIds.slice(i, i + CACHE_BATCH)
    const { data: existing } = await supabase
      .from('matches')
      .select('profile_id, tender_id, ai_reason')
      .in('profile_id', profileIds)
      .in('tender_id', batch)
    for (const r of existing || []) {
      if (r.ai_reason) seen.add(`${r.profile_id}::${r.tender_id}`)
    }
  }
  console.log(`[matching] Cache: ${seen.size} complete pairs will be skipped`)

  const userIds = [...new Set(profiles.map(p => p.user_id))]
  const learnedByUser = await fetchLearnedSignalsByUser(supabase, userIds)
  const followedByUser = await fetchFollowedTitlesByUser(supabase, userIds)
  const dismissedByUser = await fetchDismissedTitlesByUser(supabase, userIds)

  // Normalise tenders once (profile loop filters which ones are seen).
  const tenderShape = (t: typeof tenders[number]): MatchingTender => ({
    id: t.id,
    title: t.title,
    description: t.description,
    buyer_name: t.buyer_name,
    buyer_country: t.buyer_country,
    cpv_codes: t.cpv_codes,
    estimated_value_eur: t.estimated_value_eur,
  })

  const matches: MatchResult[] = []

  for (const profile of profiles) {
    // Filter tenders not already cached for this profile.
    const candidates = tenders
      .filter(t => !seen.has(`${profile.id}::${t.id}`))
      .map(tenderShape)

    if (candidates.length === 0) continue

    const results = await scoreAndRerank(
      {
        id: profile.id,
        name: profile.name,
        description: profile.description ?? null,
        keywords: profile.keywords || [],
        cpv_codes: profile.cpv_codes || [],
        exclude_keywords: profile.exclude_keywords || [],
        countries: profile.countries || [],
        min_value_eur: profile.min_value_eur,
        max_value_eur: profile.max_value_eur,
      },
      candidates,
      {
        followedTitles: followedByUser.get(profile.user_id) || [],
        dismissedTitles: dismissedByUser.get(profile.user_id) || [],
        learnedSignals: learnedByUser.get(profile.user_id),
        stage1Threshold: STAGE1_THRESHOLD,
        stage1Cap: AI_FILTER_CAP,
        aiBatchSize: AI_BATCH_SIZE,
        aiScoreThreshold: 5,
      }
    )

    console.log(
      `[matching] Profile "${profile.name}" → ${results.length} matches from ${candidates.length} candidates`
    )

    for (const r of results) {
      matches.push({
        tender_id: r.tender.id,
        profile_id: profile.id,
        user_id: profile.user_id,
        relevance_score: r.blended_score,
        matched_cpv: r.matched_cpv,
        matched_keywords: r.matched_keywords,
        ai_reason: r.ai_reason,
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
        ai_reason: m.ai_reason,
      })),
      { onConflict: 'tender_id,profile_id' }
    )
    if (error) console.error('Failed to upsert matches:', error)
  }

  return matches
}
