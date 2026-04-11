import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateRelevance, extractLearnedKeywords, LearnedSignals } from '@/lib/ai/relevance-score'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MAX_DAYS = 90
const MATCH_THRESHOLD = 20
const TED_API_BASE = 'https://api.ted.europa.eu/v3'

const TED_FIELDS = [
  'notice-title',
  'description-glo',
  'organisation-country-buyer',
  'buyer-name',
  'deadline-receipt-tender-date-lot',
  'classification-cpv',
  'estimated-value-lot',
  'publication-date',
  'notice-type',
  'contract-nature',
]

interface TenderInsert {
  source: 'ted'
  external_id: string
  title: string
  description: string | null
  buyer_name: string | null
  buyer_country: string | null
  cpv_codes: string[]
  procedure_type: string | null
  tender_type: string | null
  estimated_value_eur: number | null
  currency: string
  submission_deadline: string | null
  publication_date: string
  document_url: string | null
  ted_url: string | null
  language: string
  raw_data: unknown
}

// Extract from multilingual object: { eng: "...", dan: "..." } or { eng: ["..."], dan: ["..."] }
function extractMultilingual(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return typeof obj === 'string' ? obj : null
  if (Array.isArray(obj)) {
    return obj.map(d => extractMultilingual(d)).filter(Boolean).join(' ') || null
  }
  const t = obj as Record<string, unknown>
  for (const lang of ['eng', 'dan', ...Object.keys(t)]) {
    const val = t[lang]
    if (typeof val === 'string' && val) return val
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0]
  }
  return null
}

function parseNotice(raw: Record<string, unknown>): TenderInsert | null {
  try {
    const pubNumber = raw['publication-number'] as string | undefined
    if (!pubNumber) return null

    const title = extractMultilingual(raw['notice-title']) || 'Untitled'
    const description = extractMultilingual(raw['description-glo'])
    const buyerName = extractMultilingual(raw['buyer-name'])

    // Country — array of country codes
    const countryRaw = raw['organisation-country-buyer']
    const buyerCountry = Array.isArray(countryRaw)
      ? (countryRaw[0] as string) || null
      : typeof countryRaw === 'string' ? countryRaw : null

    // CPV codes — deduplicated
    const cpvRaw = raw['classification-cpv']
    const cpvCodes = Array.isArray(cpvRaw)
      ? [...new Set(cpvRaw.map(c => String(c).replace(/-\d$/, '')))]
      : []

    // Estimated value
    const valueRaw = raw['estimated-value-lot']
    let estimatedValue: number | null = null
    if (typeof valueRaw === 'number') {
      estimatedValue = valueRaw
    } else if (Array.isArray(valueRaw) && valueRaw.length > 0) {
      estimatedValue = typeof valueRaw[0] === 'number' ? valueRaw[0] : parseFloat(String(valueRaw[0])) || null
    }

    // Deadline
    const deadlineRaw = raw['deadline-receipt-tender-date-lot']
    let deadline: string | null = null
    if (deadlineRaw) {
      const dl = Array.isArray(deadlineRaw) ? deadlineRaw[0] : deadlineRaw
      if (dl) {
        try { deadline = new Date(String(dl)).toISOString() } catch { /* skip */ }
      }
    }

    // Publication date — "2026-03-02+01:00" format
    const pubDateRaw = raw['publication-date']
    let pubDate: string
    if (pubDateRaw) {
      const dateStr = String(pubDateRaw).split('+')[0].split('T')[0]
      const d = new Date(dateStr)
      pubDate = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : dateStr
    } else {
      pubDate = new Date().toISOString().split('T')[0]
    }

    const noticeType = typeof raw['notice-type'] === 'string' ? raw['notice-type'] : null
    const contractNature = Array.isArray(raw['contract-nature'])
      ? (raw['contract-nature'][0] as string) || null
      : typeof raw['contract-nature'] === 'string' ? raw['contract-nature'] : null

    return {
      source: 'ted',
      external_id: pubNumber,
      title,
      description,
      buyer_name: buyerName,
      buyer_country: buyerCountry,
      cpv_codes: cpvCodes,
      procedure_type: contractNature,
      tender_type: noticeType,
      estimated_value_eur: estimatedValue,
      currency: 'EUR',
      submission_deadline: deadline,
      publication_date: pubDate,
      document_url: null,
      ted_url: `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`,
      language: 'EN',
      raw_data: raw,
    }
  } catch (err) {
    console.error('Failed to parse TED notice:', err)
    return null
  }
}

// Build targeted TED queries from user profiles
function buildTedQueries(
  profiles: { cpv_codes: string[]; keywords: string[]; countries: string[] }[],
  dateStr: string
): string[] {
  const queries: string[] = []

  for (const profile of profiles) {
    // Query by CPV codes (most specific)
    if (profile.cpv_codes.length > 0) {
      // TED uses classification-cpv field — search by CPV prefix
      const cpvParts = profile.cpv_codes.slice(0, 5).map(c => {
        // Use 2-digit division level for broader matching
        const prefix = c.substring(0, 2)
        return `classification-cpv=${prefix}*`
      })
      queries.push(`PD>=${dateStr} AND (${cpvParts.join(' OR ')})`)
    }

    // Query by keywords (full-text search)
    if (profile.keywords.length > 0) {
      const kwParts = profile.keywords.slice(0, 5).map(k => `FT~"${k}"`)
      queries.push(`PD>=${dateStr} AND (${kwParts.join(' OR ')})`)
    }

    // Query by country if set
    if (profile.countries.length > 0 && profile.countries.length <= 3) {
      const countryMap: Record<string, string> = {
        'DK': 'DNK', 'NO': 'NOR', 'SE': 'SWE', 'DE': 'DEU',
        'NL': 'NLD', 'FI': 'FIN', 'FR': 'FRA', 'UK': 'GBR',
        'ES': 'ESP', 'IT': 'ITA', 'PL': 'POL', 'BE': 'BEL',
        'AT': 'AUT', 'PT': 'PRT', 'IE': 'IRL', 'CZ': 'CZE',
        'RO': 'ROU', 'BG': 'BGR', 'HR': 'HRV', 'LT': 'LTU',
        'LV': 'LVA', 'EE': 'EST',
      }
      const tedCountries = profile.countries
        .map(c => countryMap[c] || c)
        .filter(Boolean)
      if (tedCountries.length > 0) {
        const countryFilter = tedCountries.map(c => `organisation-country-buyer=${c}`).join(' OR ')
        queries.push(`PD>=${dateStr} AND (${countryFilter})`)
      }
    }
  }

  // Deduplicate queries
  return [...new Set(queries)]
}

async function fetchTedPage(query: string, page: number): Promise<Record<string, unknown>[]> {
  const searchBody = {
    query,
    fields: TED_FIELDS,
    limit: 100,
    page,
    scope: 2,
  }

  const response = await fetch(`${TED_API_BASE}/notices/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(searchBody),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'no body')
    throw new Error(`TED API ${response.status}: ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.notices || []
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const days = Math.min(Math.max(Number(body.days) || 7, 1), MAX_DAYS)

  const since = new Date()
  since.setDate(since.getDate() - days)
  const dateStr = since.toISOString().split('T')[0].replace(/-/g, '')

  const serviceClient = getServiceClient()
  const errors: string[] = []

  // Get user's profiles first — we need them to build targeted queries
  const { data: profiles } = await serviceClient
    .from('monitoring_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({
      success: false,
      ingested: 0,
      matched: 0,
      days,
      errors: ['No active profiles. Create a monitoring profile first.'],
    })
  }

  // Build targeted TED queries from profiles
  const tedQueries = buildTedQueries(profiles, dateStr)

  // Step 1: Fetch from TED with targeted queries
  let totalIngested = 0
  const seenIds = new Set<string>()

  for (const query of tedQueries) {
    try {
      let page = 1
      let hasMore = true

      while (hasMore && page <= 3) {
        // Rate limit between requests
        if (page > 1 || tedQueries.indexOf(query) > 0) {
          await new Promise(r => setTimeout(r, 500))
        }

        const notices = await fetchTedPage(query, page)

        if (notices.length === 0) {
          hasMore = false
          break
        }

        const parsed = notices
          .map(parseNotice)
          .filter((t): t is TenderInsert => t !== null)
          .filter(t => {
            if (seenIds.has(t.external_id)) return false
            seenIds.add(t.external_id)
            return true
          })

        if (parsed.length > 0) {
          const { error } = await serviceClient
            .from('tenders')
            .upsert(parsed, { onConflict: 'source,external_id' })

          if (error) {
            errors.push(`DB upsert: ${error.message}`)
          } else {
            totalIngested += parsed.length
          }
        }

        hasMore = notices.length >= 100
        page++
      }
    } catch (err) {
      errors.push(`TED query error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Step 2: Match against profiles
  const { data: tenders, error: tenderFetchErr } = await serviceClient
    .from('tenders')
    .select('*')
    .gte('publication_date', since.toISOString().split('T')[0])

  if (tenderFetchErr) {
    errors.push(`DB fetch: ${tenderFetchErr.message}`)
  }

  let totalMatches = 0

  if (tenders && tenders.length > 0) {
    const matches = []

    // Build learned signals from this user's subscribed tenders
    let learned: LearnedSignals | undefined
    const { data: subscribed } = await serviceClient
      .from('matches')
      .select('tender:tenders(title, cpv_codes)')
      .eq('user_id', user.id)
      .eq('bookmarked', true)

    if (subscribed && subscribed.length > 0) {
      const titles: string[] = []
      const cpvCounts = new Map<string, number>()
      for (const row of subscribed as Array<{
        tender: { title: string | null; cpv_codes: string[] | null } | null
      }>) {
        const t = row.tender
        if (!t) continue
        if (t.title) titles.push(t.title)
        if (Array.isArray(t.cpv_codes)) {
          for (const c of t.cpv_codes) cpvCounts.set(c, (cpvCounts.get(c) || 0) + 1)
        }
      }
      const recurringCpvs = [...cpvCounts.entries()]
        .filter(([, n]) => n >= 2)
        .map(([c]) => c)
      learned = {
        cpv_codes: recurringCpvs.length > 0 ? recurringCpvs : [...cpvCounts.keys()].slice(0, 20),
        keywords: extractLearnedKeywords(titles),
      }
    }

    for (const tender of tenders) {
      for (const profile of profiles) {
        const result = calculateRelevance(
          {
            cpv_codes: tender.cpv_codes || [],
            title: tender.title,
            description: tender.description,
            buyer_country: tender.buyer_country,
            estimated_value_eur: tender.estimated_value_eur,
          },
          {
            cpv_codes: profile.cpv_codes || [],
            keywords: profile.keywords || [],
            exclude_keywords: profile.exclude_keywords || [],
            countries: profile.countries || [],
            min_value_eur: profile.min_value_eur,
            max_value_eur: profile.max_value_eur,
          },
          learned
        )

        if (result.score >= MATCH_THRESHOLD) {
          matches.push({
            tender_id: tender.id,
            profile_id: profile.id,
            user_id: user.id,
            relevance_score: result.score,
            matched_cpv: result.matched_cpv,
            matched_keywords: result.matched_keywords,
          })
        }
      }
    }

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i += 500) {
        const batch = matches.slice(i, i + 500)
        const { error } = await serviceClient.from('matches').upsert(
          batch,
          { onConflict: 'tender_id,profile_id' }
        )
        if (error) errors.push(`Match upsert: ${error.message}`)
      }
      totalMatches = matches.length
    }
  }

  return NextResponse.json({
    success: errors.length === 0 || totalIngested > 0,
    ingested: totalIngested,
    matched: totalMatches,
    days,
    queries_run: tedQueries.length,
    tenders_in_period: tenders?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  })
}
