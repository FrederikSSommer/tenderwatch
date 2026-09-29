import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { scoreAndRerank, MatchingTender } from './core'
import {
  fetchLearnedSignalsByProfile,
  fetchFollowedTitlesByProfile,
  fetchDismissedTitlesByProfile,
  STAGE1_THRESHOLD,
  AI_FILTER_CAP,
  AI_BATCH_SIZE,
  AI_SCORE_THRESHOLD,
} from './engine'

type SupabaseSrv = SupabaseClient<Database>

// Matches persisted by the old Stage-2 failure fallback: Claude never scored
// them, and their ai_reason is the synthesized Stage-1 text
// ("Matched on CPV … + keywords: …"). Being non-null, the engine's cache
// treated them as complete, so they were never re-evaluated.
const FALLBACK_REASON_PATTERN = 'Matched on %'

interface FallbackRow {
  id: string
  tender_id: string
  profile_id: string
  bookmarked: boolean | null
  dismissed: boolean | null
  tender: MatchingTender | null
}

export interface RescoreStats {
  examined: number
  confirmed: number
  deleted: number
  /** Followed/dismissed rows Claude rejected: kept, ai_reason cleared. */
  keptUserActioned: number
  /** Left untouched because Claude failed; picked up by the next run. */
  unscored: number
  /** Rows still matching the pattern after this run. */
  remaining: number
}

/**
 * Re-run fallback-polluted matches through the real Claude rerank.
 *
 * - Claude confirms (score >= AI_SCORE_THRESHOLD) → row updated with the AI
 *   score and reason.
 * - Claude rejects → row deleted, unless the user followed or dismissed it
 *   (that user signal is kept; ai_reason is cleared so it is not re-processed).
 * - Claude fails → row left as-is for the next run.
 *
 * Processes at most `maxRows` per call so it fits in one function invocation.
 */
export async function rescoreFallbackMatches(
  supabase: SupabaseSrv,
  opts: { maxRows?: number } = {}
): Promise<RescoreStats> {
  const maxRows = opts.maxRows ?? 240
  const stats: RescoreStats = {
    examined: 0, confirmed: 0, deleted: 0, keptUserActioned: 0, unscored: 0, remaining: 0,
  }

  const { data, error } = await supabase
    .from('matches')
    .select(
      'id, tender_id, profile_id, bookmarked, dismissed, ' +
      'tender:tenders(id, title, description, buyer_name, buyer_country, cpv_codes, estimated_value_eur)'
    )
    .like('ai_reason', FALLBACK_REASON_PATTERN)
    .order('profile_id')
    .limit(maxRows)
  if (error) throw error
  const rows = (data ?? []) as unknown as FallbackRow[]
  stats.examined = rows.length

  if (rows.length > 0) {
    const byProfile = new Map<string, FallbackRow[]>()
    for (const r of rows) {
      const list = byProfile.get(r.profile_id) || []
      list.push(r)
      byProfile.set(r.profile_id, list)
    }
    const profileIds = [...byProfile.keys()]

    const { data: profiles, error: pErr } = await supabase
      .from('monitoring_profiles')
      .select('*')
      .in('id', profileIds)
    if (pErr) throw pErr
    const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

    const learnedByProfile = await fetchLearnedSignalsByProfile(supabase, profileIds)
    const followedByProfile = await fetchFollowedTitlesByProfile(supabase, profileIds)
    const dismissedByProfile = await fetchDismissedTitlesByProfile(supabase, profileIds)

    const toDelete: string[] = []
    const toClear: string[] = []

    for (const [profileId, group] of byProfile) {
      const profile = profileById.get(profileId)
      const scorable = group.filter(r => r.tender)
      // Orphaned rows (tender or profile gone) cannot be valid matches.
      for (const r of group) {
        if (!r.tender || !profile) {
          if (r.bookmarked || r.dismissed) toClear.push(r.id)
          else toDelete.push(r.id)
        }
      }
      if (!profile || scorable.length === 0) continue

      const { matches, unscoredTenderIds } = await scoreAndRerank(
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
        scorable.map(r => ({ ...r.tender!, cpv_codes: r.tender!.cpv_codes || [] })),
        {
          followedTitles: followedByProfile.get(profileId) || [],
          dismissedTitles: dismissedByProfile.get(profileId) || [],
          learnedSignals: learnedByProfile.get(profileId),
          stage1Threshold: STAGE1_THRESHOLD,
          stage1Cap: AI_FILTER_CAP,
          aiBatchSize: AI_BATCH_SIZE,
          aiScoreThreshold: AI_SCORE_THRESHOLD,
        }
      )

      const confirmed = new Map(matches.map(m => [m.tender.id, m]))
      const unscored = new Set(unscoredTenderIds)

      for (const r of scorable) {
        const m = confirmed.get(r.tender_id)
        if (m) {
          const { error: uErr } = await supabase
            .from('matches')
            .update({
              relevance_score: m.blended_score,
              matched_cpv: m.matched_cpv,
              matched_keywords: m.matched_keywords,
              ai_reason: m.ai_reason,
            })
            .eq('id', r.id)
          if (uErr) console.error('[rescore] update failed:', uErr)
          else stats.confirmed++
        } else if (unscored.has(r.tender_id)) {
          stats.unscored++
        } else if (r.bookmarked || r.dismissed) {
          toClear.push(r.id)
        } else {
          toDelete.push(r.id)
        }
      }
    }

    for (let i = 0; i < toDelete.length; i += 500) {
      const { error: dErr } = await supabase
        .from('matches')
        .delete()
        .in('id', toDelete.slice(i, i + 500))
      if (dErr) console.error('[rescore] delete failed:', dErr)
      else stats.deleted += Math.min(500, toDelete.length - i)
    }
    for (let i = 0; i < toClear.length; i += 500) {
      const { error: cErr } = await supabase
        .from('matches')
        .update({ ai_reason: null })
        .in('id', toClear.slice(i, i + 500))
      if (cErr) console.error('[rescore] clear failed:', cErr)
      else stats.keptUserActioned += Math.min(500, toClear.length - i)
    }
  }

  const { count } = await supabase
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .like('ai_reason', FALLBACK_REASON_PATTERN)
  stats.remaining = count ?? 0

  console.log('[rescore] fallback matches:', stats)
  return stats
}
