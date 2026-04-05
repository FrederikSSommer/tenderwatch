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

// Safely extract a nested value from an object
function dig(obj: unknown, ...keys: string[]): unknown {
  let current = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function safeString(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string') return val
  if (Array.isArray(val) && val.length > 0) return String(val[0])
  return String(val)
}

// Parse a TED API v3 notice into our DB format — handles multiple response shapes
function parseNotice(raw: Record<string, unknown>): TenderInsert | null {
  try {
    // Try v3 format fields first, fall back to legacy field codes
    const externalId =
      safeString(raw['publication-number']) ||
      safeString(raw['ND']) ||
      safeString(raw['notice-id']) ||
      safeString(raw['id'])

    if (!externalId) return null

    const title =
      safeString(raw['title']) ||
      safeString(dig(raw, 'title-text', 'value')) ||
      safeString(raw['TI']) ||
      'Untitled'

    const description =
      safeString(raw['description']) ||
      safeString(dig(raw, 'short-description', 'value')) ||
      null

    const buyerName =
      safeString(raw['buyer-name']) ||
      safeString(dig(raw, 'organisation', 'name')) ||
      safeString(raw['AU']) ||
      null

    const buyerCountry =
      safeString(raw['buyer-country']) ||
      safeString(dig(raw, 'organisation', 'country')) ||
      safeString(raw['CY']) ||
      null

    // CPV codes — various formats
    let cpvCodes: string[] = []
    const rawCpv = raw['cpv-codes'] || raw['cpv'] || raw['OC'] || raw['classification']
    if (Array.isArray(rawCpv)) {
      cpvCodes = rawCpv.map((c) => String(typeof c === 'object' ? (c as Record<string, unknown>).code || c : c).replace(/-\d$/, ''))
    } else if (typeof rawCpv === 'string') {
      cpvCodes = [rawCpv.replace(/-\d$/, '')]
    }

    const procedureType =
      safeString(raw['procedure-type']) || safeString(raw['PR']) || null

    const tenderType =
      safeString(raw['notice-type']) || safeString(raw['NC']) || null

    // Value
    const estimatedValue =
      (raw['estimated-value'] as number) ||
      (raw['TVH'] as number) ||
      (raw['TVL'] as number) ||
      null

    // Deadline
    let deadline: string | null = null
    const rawDeadline = raw['submission-deadline'] || raw['deadline'] || raw['DT']
    if (rawDeadline) {
      try {
        deadline = new Date(String(rawDeadline)).toISOString()
      } catch {
        deadline = null
      }
    }

    // Publication date
    const rawPubDate = raw['publication-date'] || raw['DD'] || raw['dispatch-date']
    let pubDate: string
    if (rawPubDate) {
      const d = new Date(String(rawPubDate))
      pubDate = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0]
    } else {
      pubDate = new Date().toISOString().split('T')[0]
    }

    return {
      source: 'ted',
      external_id: externalId,
      title,
      description,
      buyer_name: buyerName,
      buyer_country: buyerCountry,
      cpv_codes: cpvCodes,
      procedure_type: procedureType,
      tender_type: tenderType,
      estimated_value_eur: estimatedValue,
      currency: 'EUR',
      submission_deadline: deadline,
      publication_date: pubDate,
      document_url: null,
      ted_url: `https://ted.europa.eu/en/notice/-/${externalId}`,
      language: safeString(raw['OL']) || safeString(raw['language']) || 'EN',
      raw_data: raw,
    }
  } catch (err) {
    console.error('Failed to parse notice:', err, raw)
    return null
  }
}

export async function POST(request: NextRequest) {
  // Auth check
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
        query: `PD>=${dateStr} AND TD=[3]`,
        pageSize: 100,
        page,
        scope: 2,
        sortField: 'DD',
        sortOrder: 'desc',
      }

      const tedResponse = await fetch(`${TED_API_BASE}/notices/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody),
      })

      if (!tedResponse.ok) {
        const text = await tedResponse.text().catch(() => 'no body')
        errors.push(`TED API returned ${tedResponse.status}: ${text.slice(0, 200)}`)
        break
      }

      const tedData = await tedResponse.json()

      // Handle different response shapes
      const results: Record<string, unknown>[] =
        tedData.results || tedData.notices || tedData.data || []

      if (!Array.isArray(results) || results.length === 0) {
        // If first page is empty, there are no results at all
        if (page === 1) {
          errors.push(`TED returned no results. Response keys: ${Object.keys(tedData).join(', ')}`)
        }
        hasMore = false
        break
      }

      const parsed = results
        .map((notice) => parseNotice(notice))
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
      success: true,
      ingested: totalIngested,
      matched: 0,
      days,
      errors: errors.length > 0 ? errors : undefined,
      message: totalIngested > 0
        ? 'Tenders ingested but no active profiles to match against.'
        : 'No active profiles found.',
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
      // Upsert in batches of 500 to avoid payload limits
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
    success: errors.length === 0 || totalIngested > 0 || totalMatches > 0,
    ingested: totalIngested,
    matched: totalMatches,
    days,
    tenders_in_period: tenders?.length ?? 0,
    errors: errors.length > 0 ? errors : undefined,
  })
}
