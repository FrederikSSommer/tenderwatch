import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  calculateRelevance,
  extractLearnedKeywords,
  LearnedSignals,
  ScoreResult,
} from '@/lib/ai/relevance-score'

export interface MatchResult {
  tender_id: string
  profile_id: string
  user_id: string
  relevance_score: number
  matched_cpv: string[]
  matched_keywords: string[]
}

const MATCH_THRESHOLD = 20

// Build per-user learned signals from each user's subscribed (bookmarked) tenders.
// These bias future scoring toward patterns the user has shown interest in.
async function fetchLearnedSignalsByUser(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
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
    // Keep CPVs that appear at least twice — single occurrences are noisy
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

export async function matchNewTenders(since: Date): Promise<MatchResult[]> {
  const supabase = await createServerSupabaseClient()

  // Get tenders published since the given date
  const { data: tenders, error: tErr } = await supabase
    .from('tenders')
    .select('*')
    .gte('publication_date', since.toISOString().split('T')[0])

  if (tErr || !tenders) {
    console.error('Failed to fetch tenders:', tErr)
    return []
  }

  // Get all active monitoring profiles
  const { data: profiles, error: pErr } = await supabase
    .from('monitoring_profiles')
    .select('*')
    .eq('active', true)

  if (pErr || !profiles) {
    console.error('Failed to fetch profiles:', pErr)
    return []
  }

  // Fetch learned signals once per user — used to bias scoring
  const userIds = [...new Set(profiles.map(p => p.user_id))]
  const learnedByUser = await fetchLearnedSignalsByUser(supabase, userIds)

  const matches: MatchResult[] = []

  for (const tender of tenders) {
    for (const profile of profiles) {
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

      if (result.score >= MATCH_THRESHOLD) {
        matches.push({
          tender_id: tender.id,
          profile_id: profile.id,
          user_id: profile.user_id,
          relevance_score: result.score,
          matched_cpv: result.matched_cpv,
          matched_keywords: result.matched_keywords,
        })
      }
    }
  }

  // Batch upsert matches
  if (matches.length > 0) {
    const { error } = await supabase.from('matches').upsert(
      matches.map((m) => ({
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
