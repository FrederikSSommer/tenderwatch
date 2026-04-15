/**
 * Wizard example-tenders endpoint.
 *
 * Flow:
 *  1. Infer a draft profile from the user's description (same AI logic as
 *     the post-swipe generate-profile, minus swipe history).
 *  2. Query TED live using the profile's CPV codes + keywords, so we find
 *     tenders even in sectors not yet ingested by the daily cron.
 *  3. Run the inferred draft profile through the production matching core
 *     (`scoreAndRerank`) with empty follow/dismiss history so the wizard
 *     shows the same quality tenders the user would see in the live feed.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { inferDraftProfile } from '@/lib/ai/infer-profile'
import { scoreAndRerank, MatchingTender } from '@/lib/matching/core'

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── TED API helpers ────────────────────────────────────────────────────

const TED_API_BASE = 'https://api.ted.europa.eu/v3'
const TED_FIELDS = [
  'notice-title',
  'description-glo',
  'organisation-country-buyer',
  'buyer-name',
  'classification-cpv',
  'estimated-value-lot',
  'publication-date',
  'notice-type',
]

/** ISO-2 → TED 3-letter country codes. */
const COUNTRY_MAP: Record<string, string> = {
  DK: 'DNK', NO: 'NOR', SE: 'SWE', DE: 'DEU',
  NL: 'NLD', FI: 'FIN', FR: 'FRA', UK: 'GBR',
  PL: 'POL', ES: 'ESP', IT: 'ITA', BE: 'BEL',
  AT: 'AUT', PT: 'PRT', IE: 'IRL', CZ: 'CZE',
  RO: 'ROU', BG: 'BGR', HR: 'HRV', LT: 'LTU',
  LV: 'LVA', EE: 'EST',
}

function extractMultilingual(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return typeof obj === 'string' ? obj : null
  if (Array.isArray(obj))
    return obj.map(d => extractMultilingual(d)).filter(Boolean).join(' ') || null
  const t = obj as Record<string, unknown>
  for (const lang of ['eng', 'dan', ...Object.keys(t)]) {
    const val = t[lang]
    if (typeof val === 'string' && val) return val
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0]
  }
  return null
}

async function searchTED(
  query: string,
  limit = 20
): Promise<Record<string, unknown>[]> {
  try {
    const res = await fetch(`${TED_API_BASE}/notices/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, fields: TED_FIELDS, limit, page: 1, scope: 2 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.notices || []
  } catch {
    return []
  }
}

function parseTender(n: Record<string, unknown>): MatchingTender & {
  externalId: string
  buyerName: string | null
  tedUrl: string
  noticeType: string | null
  publicationDate: string | null
  relevanceScore?: number
  relevanceReason?: string | null
} {
  const cpvRaw = n['classification-cpv']
  const cpvCodes = Array.isArray(cpvRaw)
    ? [...new Set(cpvRaw.map((c: unknown) => String(c)))]
    : []

  const countryRaw = n['organisation-country-buyer']
  const country = Array.isArray(countryRaw) ? countryRaw[0] : countryRaw

  const valueRaw = n['estimated-value-lot']
  const value =
    typeof valueRaw === 'number'
      ? valueRaw
      : Array.isArray(valueRaw) && typeof valueRaw[0] === 'number'
        ? valueRaw[0]
        : null

  const desc = extractMultilingual(n['description-glo'])
  const pubNum = n['publication-number'] as string

  return {
    id: pubNum,
    externalId: pubNum,
    title: extractMultilingual(n['notice-title']) || 'Untitled',
    buyerName: extractMultilingual(n['buyer-name']),
    buyer_name: extractMultilingual(n['buyer-name']),
    buyer_country: typeof country === 'string' ? country : null,
    cpv_codes: cpvCodes,
    estimated_value_eur: value,
    description: desc ? desc.slice(0, 250) : null,
    tedUrl: `https://ted.europa.eu/en/notice/-/detail/${pubNum}`,
    noticeType: (n['notice-type'] as string) || null,
    publicationDate: (n['publication-date'] as string) || null,
  }
}

// ── Main handler ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { description, sectors, subsectors, countries } = await request.json()

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 180)
  const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '')

  // ── Step 1: Infer a draft profile ─────────────────────────────────
  // Returns 8-digit CPV codes + English keywords (same schema as a saved
  // monitoring_profile row) plus native_keywords for TED search.
  let draftProfile
  try {
    draftProfile = await inferDraftProfile({ description, sectors, subsectors, countries })
  } catch (err) {
    console.error('[example-tenders] Profile inference failed:', err)
    return NextResponse.json(
      { tenders: [], noMatches: true, error: 'Profile inference failed' },
      { status: 500 }
    )
  }

  const { cpv_codes, keywords, native_keywords } = draftProfile
  const tedCountries = (countries || [])
    .map((c: string) => COUNTRY_MAP[c] || c)
    .filter(Boolean)

  // ── Step 2: Query TED live ─────────────────────────────────────────
  // Build CPV prefix queries using the first 4-8 digits of each code
  // (avoids locking to the exact 8-digit code for the TED wildcard search),
  // plus full-text keyword queries for English + native terms.
  const queries: string[] = []

  if (cpv_codes.length > 0) {
    // Use 4-digit prefix for TED wildcard: "34510000" → "3451*"
    // (more specific than 8-digit exact, more targeted than 3-digit)
    const cpvFilter = cpv_codes
      .slice(0, 10)
      .map(c => `classification-cpv=${c.slice(0, 4)}*`)
      .join(' OR ')

    if (tedCountries.length > 0 && tedCountries.length <= 5) {
      const cf = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queries.push(`PD>=${dateStr} AND (${cpvFilter}) AND (${cf})`)
    }
    queries.push(`PD>=${dateStr} AND (${cpvFilter})`)
  }

  const allKeywords = [...keywords, ...native_keywords]
  if (allKeywords.length > 0) {
    const kwFilter = allKeywords.slice(0, 8).map(k => `FT~"${k}"`).join(' OR ')
    if (tedCountries.length > 0) {
      const cf = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queries.push(`PD>=${dateStr} AND (${kwFilter}) AND (${cf})`)
    }
    queries.push(`PD>=${dateStr} AND (${kwFilter})`)
  }

  const seenIds = new Set<string>()
  const rawNotices: Record<string, unknown>[] = []
  for (const query of queries) {
    const notices = await searchTED(query, 20)
    for (const n of notices) {
      const id = n['publication-number'] as string
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        rawNotices.push(n)
      }
    }
    await new Promise(r => setTimeout(r, 200))
  }

  const parsed = rawNotices.map(parseTender)

  // ── Step 3: Ingest into tenders table ─────────────────────────────
  // Best-effort: allows the backfill route to reference these later.
  const supabase = getServiceClient()
  if (parsed.length > 0) {
    const rows = parsed.map(t => ({
      source: 'ted' as const,
      external_id: t.externalId,
      title: t.title,
      description: t.description,
      buyer_name: t.buyerName,
      buyer_country: t.buyer_country,
      cpv_codes: t.cpv_codes,
      estimated_value_eur: t.estimated_value_eur,
      publication_date: t.publicationDate || new Date().toISOString().split('T')[0],
      ted_url: t.tedUrl,
      notice_type: t.noticeType,
    }))
    try {
      await supabase.from('tenders').upsert(rows, { onConflict: 'source,external_id' })
    } catch {
      // Don't block the wizard if DB write fails.
    }
  }

  if (parsed.length === 0) {
    return NextResponse.json({
      tenders: [],
      noMatches: true,
      queriesRun: queries.length,
      cpvCodes: cpv_codes,
      keywords,
    })
  }

  // ── Step 4 + 5: Score with the production matching core ────────────
  // Uses the same Stage-1 CPV/keyword scorer and Stage-2 Claude rerank
  // as the daily cron. Empty history = first-time user, no bias.
  //
  // Threshold is 5 (same as cron) so the swipe deck includes both
  // bullseye matches (9-10) AND topic-overlap-but-not-core matches
  // (5-6). The user needs both — likes refine the profile, dislikes
  // teach Claude what to filter out when the final profile is generated.
  const candidates: MatchingTender[] = parsed

  // Need at least this many STRONG matches (ai_score >= 7) for the wizard
  // to feel useful. Below this, we ask the user to refine their description.
  const MIN_STRONG_MATCHES = 3
  const STRONG_SCORE = 7

  const scored = await scoreAndRerank(
    {
      ...draftProfile,
      id: 'onboarding-draft',
      name: draftProfile.profile_name,
    },
    candidates,
    {
      followedTitles: [],
      dismissedTitles: [],
      stage1Threshold: 5,
      stage1Cap: 60,
      aiBatchSize: 30,
      aiScoreThreshold: 5,
      maxResults: 12,
    }
  )

  // Map to camelCase for the wizard Tender interface, and use the 0-10 AI
  // score for the relevance badge (wizard shows "X/10").
  const results = scored.map(m => {
    const raw = parsed.find(p => p.id === m.tender.id)!
    return {
      id: m.tender.id,
      title: m.tender.title,
      buyerName: raw.buyerName,
      buyerCountry: m.tender.buyer_country,
      cpvCodes: m.tender.cpv_codes,
      estimatedValue: m.tender.estimated_value_eur,
      description: m.tender.description,
      tedUrl: raw.tedUrl,
      noticeType: raw.noticeType,
      publicationDate: raw.publicationDate,
      relevanceScore: m.ai_score ?? Math.round(m.blended_score / 10),
      relevanceReason: m.ai_reason,
    }
  })

  const strongCount = results.filter(r => (r.relevanceScore ?? 0) >= STRONG_SCORE).length

  if (strongCount >= MIN_STRONG_MATCHES) {
    return NextResponse.json({
      tenders: results,
      queriesRun: queries.length,
      cpvCodes: cpv_codes,
      keywords,
      filteredFrom: parsed.length,
    })
  }

  return NextResponse.json({
    tenders: results,
    noMatches: true,
    queriesRun: queries.length,
    cpvCodes: cpv_codes,
    keywords,
    filteredFrom: parsed.length,
  })
}
