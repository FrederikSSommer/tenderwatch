import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateRelevance, ScoreResult } from '@/lib/ai/relevance-score'

export interface MatchResult {
  tender_id: string
  profile_id: string
  user_id: string
  relevance_score: number
  matched_cpv: string[]
  matched_keywords: string[]
}

const MATCH_THRESHOLD = 20

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
        }
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
