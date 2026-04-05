import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateRelevance } from '@/lib/ai/relevance-score'
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

// Extract title — notice-title is a multilingual object { eng: "...", dan: "...", ... }
function extractTitle(titleObj: unknown): string {
  if (!titleObj || typeof titleObj !== 'object') return 'Untitled'
  const t = titleObj as Record<string, string>
  // Prefer English, then Danish, then first available
  return t['eng'] || t['dan'] || Object.values(t)[0] || 'Untitled'
}

// Extract description — same multilingual format
function extractDescription(descObj: unknown): string | null {
  if (!descObj || typeof descObj !== 'object') return null
  if (Array.isArray(descObj)) {
    // description-glo can be an array of multilingual objects
    return descObj.map(d => extractTitle(d)).filter(Boolean).join(' ') || null
  }
  const d = descObj as Record<string, string>
  return d['eng'] || d['dan'] || Object.values(d)[0] || null
}

function parseNotice(raw: Record<string, unknown>): TenderInsert | null {
  try {
    const pubNumber = raw['publication-number'] as string | undefined
    if (!pubNumber) return null

    const title = extractTitle(raw['notice-title'])

    const description = extractDescription(raw['description-glo'])

    // Buyer name — can be string or array
    const buyerNameRaw = raw['buyer-name']
    const buyerName = Array.isArray(buyerNameRaw)
      ? (buyerNameRaw[0] as string) || null
      : typeof buyerNameRaw === 'string'
        ? buyerNameRaw
        : null

    // Country — array of country codes
    const countryRaw = raw['organisation-country-buyer']
    const buyerCountry = Array.isArray(countryRaw)
      ? (countryRaw[0] as string) || null
      : typeof countryRaw === 'string'
        ? countryRaw
        : null

    // CPV codes — array, may have duplicates
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

    // Notice/contract type
    const noticeType = typeof raw['notice-type'] === 'string' ? raw['notice-type'] : null
    const contractNature = Array.isArray(raw['contract-nature'])
      ? (raw['contract-nature'][0] as string) || null
      : typeof raw['contract-nature'] === 'string'
        ? raw['contract-nature']
        : null

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

  // Step 1: Fetch from TED API
  let totalIngested = 0
  let page = 1
  let hasMore = true

  try {
    while (hasMore && page <= 5) {
      const searchBody = {
        query: `PD>=${dateStr}`,
        fields: TED_FIELDS,
        limit: 100,
        page,
        scope: 2,
      }

      const tedResponse = await fetch(`${TED_API_BASE}/notices/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody),
      })

      if (!tedResponse.ok) {
        const text = await tedResponse.text().catch(() => 'no body')
        errors.push(`TED API returned ${tedResponse.status}: ${text.slice(0, 300)}`)
        break
      }

      const tedData = await tedResponse.json()
      const results: Record<string, unknown>[] = tedData.notices || []

      if (!Array.isArray(results) || results.length === 0) {
        hasMore = false
        break
      }

      const parsed = results
        .map(parseNotice)
        .filter((t): t is TenderInsert => t !== null)

      if (parsed.length > 0) {
        const { error } = await serviceClient
          .from('tenders')
          .upsert(parsed, { onConflict: 'source,external_id' })

        if (error) {
          errors.push(`DB upsert error: ${error.message}`)
        } else {
          totalIngested += parsed.length
        }
      }

      hasMore = results.length >= 100
      page++
    }
  } catch (err) {
    errors.push(`TED fetch error: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Step 2: Match against this user's profiles
  const { data: profiles } = await serviceClient
    .from('monitoring_profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({
      success: totalIngested > 0,
      ingested: totalIngested,
      matched: 0,
      days,
      errors: errors.length > 0 ? errors : undefined,
      message: 'No active profiles to match against.',
    })
  }

  // Get all tenders from the backfill period
  const { data: tenders, error: tenderFetchErr } = await serviceClient
    .from('tenders')
    .select('*')
    .gte('publication_date', since.toISOString().split('T')[0])

  if (tenderFetchErr) {
    errors.push(`DB tender fetch error: ${tenderFetchErr.message}`)
  }

  let totalMatches = 0

  if (tenders && tenders.length > 0) {
    const matches = []

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
          }
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
        if (error) errors.push(`Match upsert error: ${error.message}`)
      }
      totalMatches = matches.length
    }
  }

  return NextResponse.json({
    success: errors.length === 0 || totalIngested > 0,
    ingested: totalIngested,
    matched: totalMatches,
    days,
    tenders_in_period: tenders?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  })
}
