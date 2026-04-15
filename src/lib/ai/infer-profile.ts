/**
 * Infer a monitoring profile from a company description.
 *
 * Used by two callers:
 *  - `generate-profile/route.ts` — after the user has swiped through
 *    example tenders (likedTenders + dislikedTenders available)
 *  - `example-tenders/route.ts` — before swiping, to build the initial
 *    TED search and Stage-1 scoring profile (no swipe history yet)
 *
 * Returns full 8-digit padded CPV codes that work directly with the
 * production `calculateRelevance` scorer and the shared matching core.
 * The `native_keywords` field is returned separately so the caller can
 * use them for local-language TED searches without polluting the profile
 * keywords used by the English-focused Stage-1 + Stage-2 pipeline.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface InferProfileInput {
  description: string
  companyCountry?: string
  sectors?: string[]
  subsectors?: string[]
  /** ISO 2-letter country codes the user wants to monitor. */
  countries?: string[]
  valueRange?: string
  /** Tenders the user swiped right on (post-wizard). */
  likedTenders?: Array<{
    title: string
    cpvCodes: string[]
    buyerCountry: string | null
    estimatedValue: number | null
    description: string | null
  }>
  /** Tenders the user swiped left on (post-wizard). */
  dislikedTenders?: Array<{
    title: string
    cpvCodes: string[]
  }>
}

export interface DraftProfile {
  /** 8-digit padded CPV codes, e.g. "34510000", "71240000". */
  cpv_codes: string[]
  /** English search terms matching tender titles / descriptions. */
  keywords: string[]
  exclude_keywords: string[]
  /** ISO 2-letter country codes. */
  countries: string[]
  min_value_eur: number | null
  max_value_eur: number | null
  profile_name: string
  reasoning: string
  /**
   * Keywords in the local language(s) of the target countries.
   * Used ONLY for building TED full-text search queries — not stored in
   * the profile, and not fed to Stage-1 or Stage-2 scoring.
   */
  native_keywords: string[]
}

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

/** Pad a CPV-like string to 8 digits, stripping any checksum suffix. */
function padCpv(c: string): string {
  return c.replace(/-\d+$/, '').padEnd(8, '0')
}

export async function inferDraftProfile(
  input: InferProfileInput
): Promise<DraftProfile> {
  const {
    description,
    companyCountry,
    sectors = [],
    subsectors = [],
    countries = [],
    valueRange,
    likedTenders = [],
    dislikedTenders = [],
  } = input

  const likedSection =
    likedTenders.length > 0
      ? `LIKED tenders (they want MORE like these):\n${likedTenders
          .map(
            t =>
              `- "${t.title}" [CPV: ${t.cpvCodes?.join(',')}] [Country: ${t.buyerCountry}] [Value: ${t.estimatedValue}]\n  ${t.description?.slice(0, 150) || ''}`
          )
          .join('\n')}`
      : ''

  const dislikedSection =
    dislikedTenders.length > 0
      ? `DISLIKED tenders (they do NOT want these):\n${dislikedTenders
          .map(t => `- "${t.title}" [CPV: ${t.cpvCodes?.join(',')}]`)
          .join('\n')}`
      : ''

  const hasSwipeHistory = likedTenders.length > 0 || dislikedTenders.length > 0

  const targetLangs = countries
    .map(c => COUNTRY_LANG[c])
    .filter(Boolean)
    .join(', ')

  const nativeKeywordsInstruction =
    targetLangs
      ? `native_keywords: 3-6 specific keywords in ${targetLangs} that would appear in tender TITLES on TED. These are used only for search — not stored in the profile.`
      : 'native_keywords: [] (no specific target countries)'

  const prompt = `You are an expert in EU public procurement (TED/CPV system). Analyze this company's profile${hasSwipeHistory ? ' and their tender preferences' : ''} and generate a monitoring profile.

Company: "${description}" (based in ${companyCountry || 'EU'})
Interested sectors: ${sectors.join(', ') || '(none)'}
Specific interests: ${subsectors.join(', ') || '(none)'}
Preferred countries: ${countries.join(', ') || 'Any'}
Value preference: ${valueRange || 'No preference'}
${likedSection ? `\n${likedSection}` : ''}
${dislikedSection ? `\n${dislikedSection}` : ''}
${hasSwipeHistory ? '\nAnalyze what makes the liked tenders relevant and the disliked ones irrelevant.' : ''}

Return ONLY a JSON object:
{
  "cpv_codes": ["34510000", "35513000", "71240000"],
  "keywords": ["naval architecture", "vessel design", "ship design"],
  "exclude_keywords": ["spare parts", "catering"],
  "countries": ["DK", "NO", "SE"],
  "min_value_eur": null,
  "max_value_eur": null,
  "profile_name": "Short descriptive name",
  "reasoning": "One sentence explaining the profile logic",
  "native_keywords": ["skibsdesign", "fartøj", "krigsskib"]
}

Rules:
- cpv_codes: 5-15 FULL 8-digit CPV codes (e.g. "34510000" for ships, "35513000" for warships). Use the real CPV taxonomy. Pad shorter codes to 8 digits with zeros (e.g. class "345" → representative code "34500000"). Prefer specific codes over broad ones. ${hasSwipeHistory ? 'Favor codes from liked tenders.' : ''}
- keywords: 5-10 English search terms that would appear in relevant tender titles/descriptions.
- exclude_keywords: 3-5 terms to filter out irrelevant tenders${hasSwipeHistory ? ' (derived from disliked patterns)' : ''}.
- countries: ISO 2-letter codes.
- Value range: only set if the user expressed a preference${hasSwipeHistory ? ' or if liked tenders cluster in a range' : ''}.
- ${nativeKeywordsInstruction}`

  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text =
    message.content[0].type === 'text' ? message.content[0].text : '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON for profile inference')
  }

  const raw = JSON.parse(jsonMatch[0])

  return {
    cpv_codes: ((raw.cpv_codes as string[]) || []).map(padCpv),
    keywords: (raw.keywords as string[]) || [],
    exclude_keywords: (raw.exclude_keywords as string[]) || [],
    countries: (raw.countries as string[]) || countries,
    min_value_eur: (raw.min_value_eur as number | null) ?? null,
    max_value_eur: (raw.max_value_eur as number | null) ?? null,
    profile_name: (raw.profile_name as string) || 'My profile',
    reasoning: (raw.reasoning as string) || '',
    native_keywords: (raw.native_keywords as string[]) || [],
  }
}

const COUNTRY_LANG: Record<string, string> = {
  DK: 'Danish',
  NO: 'Norwegian',
  SE: 'Swedish',
  DE: 'German',
  NL: 'Dutch',
  FI: 'Finnish',
  FR: 'French',
  PL: 'Polish',
  ES: 'Spanish',
  IT: 'Italian',
  BE: 'French/Dutch',
}
