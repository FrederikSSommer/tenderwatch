/**
 * Shared matching core — Stage 1 (cheap CPV/keyword scoring) + Stage 2
 * (Claude rerank). Pure functions, no DB I/O. Used by:
 *
 *  - `src/lib/matching/engine.ts` — daily cron over all users' profiles
 *  - `src/app/api/ai/onboarding/example-tenders/route.ts` — wizard preview
 *    against a freshly-inferred draft profile with no history
 *
 * The cron path pulls tenders from the `tenders` table and saves results to
 * `matches`. The wizard path pulls tenders live from TED and returns them
 * inline. Both funnel through the same scoring to keep quality aligned.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  calculateRelevance,
  LearnedSignals,
  ScoreResult,
} from '@/lib/ai/relevance-score'

// ── Public types ────────────────────────────────────────────────────────

export interface MatchingProfile {
  id?: string
  name?: string | null
  description?: string | null
  keywords: string[]
  /** 8-digit padded CPV codes (e.g. "34500000", "71240000"). */
  cpv_codes: string[]
  exclude_keywords: string[]
  countries: string[]
  min_value_eur: number | null
  max_value_eur: number | null
}

export interface MatchingTender {
  id: string
  title: string
  description: string | null
  buyer_name: string | null
  buyer_country: string | null
  cpv_codes: string[]
  estimated_value_eur: number | null
}

export interface MatchingOptions {
  /** Positive-example titles (tenders the user has previously followed). */
  followedTitles?: string[]
  /** Negative-example titles (tenders the user has dismissed). */
  dismissedTitles?: string[]
  /** Per-user learned signals derived from subscribed tenders. */
  learnedSignals?: LearnedSignals
  /** Stage-1 minimum score to advance a candidate to Stage 2. */
  stage1Threshold?: number
  /** Max number of Stage-1 survivors to send to Claude. */
  stage1Cap?: number
  /** Claude batch size. */
  aiBatchSize?: number
  /** Stage-2 minimum AI score (0-10) to retain. */
  aiScoreThreshold?: number
  /** Max returned matches per profile. Applied after Stage 2. */
  maxResults?: number
}

export interface ScoredMatch {
  tender: MatchingTender
  /** Stage-1 score on the 0-100 scale produced by `calculateRelevance`. */
  stage1_score: number
  /** Stage-2 AI score on the 0-10 scale, or null if Stage 2 was skipped. */
  ai_score: number | null
  /** Blended final score on the 0-100 scale (80% AI + 20% Stage 1). */
  blended_score: number
  matched_cpv: string[]
  matched_keywords: string[]
  ai_reason: string | null
}

// ── Stage-2 Claude rerank ───────────────────────────────────────────────

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

interface RerankCandidate {
  tender: MatchingTender
  stage1_score: number
  matched_cpv: string[]
  matched_keywords: string[]
}

interface AiResult {
  score: number
  why: string | null
}

/**
 * Stage-2 Claude rerank. Sends the profile snapshot + a batch of candidates
 * and asks Claude to score each 0-10 with a short reason. Unchanged prompt
 * semantics vs. the previous engine.ts implementation — just extracted so
 * both the cron and the wizard call it.
 */
async function aiRerank(
  profile: MatchingProfile,
  candidates: RerankCandidate[],
  followedTitles: string[],
  dismissedTitles: string[],
  batchSize: number,
  scoreThreshold: number
): Promise<Map<string, AiResult>> {
  const out = new Map<string, AiResult>()
  if (candidates.length === 0) return out

  const profileSnapshot =
    `Name: ${profile.name || 'monitoring profile'}\n` +
    (profile.description ? `Description: ${profile.description}\n` : '') +
    `Topic keywords: ${profile.keywords.slice(0, 12).join(', ') || '(none)'}\n` +
    `CPV codes (8-digit): ${profile.cpv_codes.slice(0, 12).join(', ') || '(none)'}\n` +
    `Excluded terms: ${profile.exclude_keywords.join(', ') || '(none)'}` +
    (followedTitles.length > 0
      ? `\n\nTenders this user has previously followed (use these to understand what they care about):\n${followedTitles.slice(0, 10).map(t => `- ${t}`).join('\n')}`
      : '') +
    (dismissedTitles.length > 0
      ? `\n\nTenders this user has DISMISSED as NOT relevant (use these to understand what they do NOT want — score similar tenders low):\n${dismissedTitles.slice(0, 15).map(t => `- ${t}`).join('\n')}`
      : '')

  for (let offset = 0; offset < candidates.length; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize)
    const prompt = `You are evaluating which public tenders are actually relevant to a buyer's monitoring profile.

PROFILE
${profileSnapshot}

Be STRICT and LITERAL. The question is: "Would this company realistically bid on this tender?"
Only match tenders where the company's core services or products are what the tender is procuring.

Examples of WRONG matches:
- A naval architecture firm matched with marine equipment spare parts (they design ships, not sell parts)
- A shipbuilding company matched with workwear, canteen catering, or cleaning services for a navy buyer
- A software/IT company matched with office furniture or printer toner
- A road construction company matched with traffic-light bulbs

A shared sector keyword (e.g. "marine", "maritime") is NOT enough. The tender must procure what the company actually delivers.

CANDIDATES (numbered)
${batch.map((c, i) => `[${i}] "${c.tender.title}"
   Buyer: ${c.tender.buyer_name || '?'}${c.tender.buyer_country ? ` (${c.tender.buyer_country})` : ''}
   CPV: ${(c.tender.cpv_codes || []).slice(0, 6).join(', ') || 'none'}
   ${c.tender.description ? c.tender.description.slice(0, 220) : ''}`).join('\n\n')}

Return ONLY a JSON array. Include ONLY entries scoring ${scoreThreshold} or higher (0-10 scale). Format:
[{"i": 0, "score": 9, "why": "short reason"}, {"i": 3, "score": 7, "why": "short reason"}, ...]`

    try {
      const msg = await getAnthropicClient().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: '[' },
        ],
      })
      const text = msg.content[0].type === 'text' ? '[' + msg.content[0].text : '[]'
      const m = text.match(/\[[\s\S]*?\]/)
      if (!m) continue
      const scored: { i: number; score: number; why?: string }[] = JSON.parse(m[0])
      for (const s of scored) {
        if (typeof s.i !== 'number' || s.score < scoreThreshold) continue
        if (s.i < 0 || s.i >= batch.length) continue
        out.set(batch[s.i].tender.id, { score: s.score, why: s.why || null })
      }
    } catch (err) {
      console.error('[core] AI rerank batch failed:', err)
      // On failure, accept Stage-1 candidates as-is with neutral AI score.
      for (const c of batch) out.set(c.tender.id, { score: 6, why: null })
    }
  }
  return out
}

// ── Public entry ────────────────────────────────────────────────────────

/**
 * Score a set of tenders against a single profile. Runs Stage 1 cheap
 * scoring, drops sub-threshold pairs, caps the survivors, and sends the
 * rest to Claude for Stage 2 rerank. Returns blended-score matches sorted
 * descending.
 *
 * Pure: no DB reads/writes. The caller decides what to do with results
 * (persist in `matches` / return in API response / display in a wizard).
 */
export async function scoreAndRerank(
  profile: MatchingProfile,
  tenders: MatchingTender[],
  options: MatchingOptions = {}
): Promise<ScoredMatch[]> {
  const {
    followedTitles = [],
    dismissedTitles = [],
    learnedSignals,
    stage1Threshold = 5,
    stage1Cap = 120,
    aiBatchSize = 30,
    aiScoreThreshold = 5,
    maxResults,
  } = options

  // Stage 1: cheap scoring with the production relevance function
  const stage1: RerankCandidate[] = []
  for (const tender of tenders) {
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
      learnedSignals
    )

    if (result.score < stage1Threshold) continue
    stage1.push({
      tender,
      stage1_score: result.score,
      matched_cpv: result.matched_cpv,
      matched_keywords: result.matched_keywords,
    })
  }

  stage1.sort((a, b) => b.stage1_score - a.stage1_score)
  const topN = stage1.slice(0, stage1Cap)

  if (topN.length === 0) return []

  // Stage 2: Claude rerank
  const aiScores = await aiRerank(
    profile,
    topN,
    followedTitles,
    dismissedTitles,
    aiBatchSize,
    aiScoreThreshold
  )

  const matches: ScoredMatch[] = []
  for (const c of topN) {
    const ai = aiScores.get(c.tender.id)
    if (ai === undefined) continue
    // 80% AI (0-10 × 8) + 20% Stage-1 (0-100 × 0.2).
    // Claude's judgment dominates; Stage 1 is a tiebreaker.
    const blended = Math.min(100, Math.round(ai.score * 8 + c.stage1_score * 0.2))
    matches.push({
      tender: c.tender,
      stage1_score: c.stage1_score,
      ai_score: ai.score,
      blended_score: blended,
      matched_cpv: c.matched_cpv,
      matched_keywords: c.matched_keywords,
      ai_reason:
        ai.why ||
        (
          `Matched on ${c.matched_cpv.length > 0 ? 'CPV ' + c.matched_cpv.slice(0, 2).join(', ') : ''}` +
          (c.matched_cpv.length > 0 && c.matched_keywords.length > 0 ? ' + ' : '') +
          (c.matched_keywords.length > 0 ? 'keywords: ' + c.matched_keywords.slice(0, 3).join(', ') : '')
        ).trim() ||
        null,
    })
  }

  matches.sort((a, b) => b.blended_score - a.blended_score)
  return maxResults ? matches.slice(0, maxResults) : matches
}
