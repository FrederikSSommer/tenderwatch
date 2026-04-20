import { NextRequest, NextResponse } from 'next/server'
import { tedClient } from '@/lib/ted/client'
import { parseTEDNotice } from '@/lib/ted/parser'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

type ServiceClient = ReturnType<typeof getServiceClient>

async function ingestNotices(
  supabase: ServiceClient,
  notices: Record<string, unknown>[]
): Promise<number> {
  const parsed = notices
    .map(parseTEDNotice)
    .filter((t): t is NonNullable<typeof t> => t !== null)
  if (parsed.length === 0) return 0

  const { error } = await supabase
    .from('tenders')
    .upsert(
      parsed.map(t => ({
        source: t.source as 'ted',
        external_id: t.external_id,
        title: t.title,
        description: t.description,
        buyer_name: t.buyer_name,
        buyer_country: t.buyer_country,
        cpv_codes: t.cpv_codes,
        procedure_type: t.procedure_type,
        tender_type: t.tender_type,
        estimated_value_eur: t.estimated_value_eur,
        currency: t.currency,
        submission_deadline: t.submission_deadline,
        publication_date: t.publication_date,
        document_url: t.document_url,
        ted_url: t.ted_url,
        language: t.language,
        raw_data: t.raw_data,
      })),
      { onConflict: 'source,external_id' }
    )

  if (error) console.error('Upsert error:', error)
  return parsed.length
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - 1)

  // Collect the union of keywords and CPV codes across all active monitoring profiles.
  // These are pushed into the TED Search API query so TED's multilingual full-text index
  // does the matching. TED's index covers titles and descriptions across all EU languages
  // natively — English keywords therefore match notices written in French, German, etc.
  // This fixes the long-standing issue of 0 keyword-only hits caused by local matching
  // running against native-language text.
  const { data: profiles } = await supabase
    .from('monitoring_profiles')
    .select('keywords, cpv_codes')
    .eq('active', true)

  const profileRows = (profiles ?? []) as Array<{ keywords: string[] | null; cpv_codes: string[] | null }>
  const allKeywords = [...new Set(profileRows.flatMap(p => p.keywords ?? []))] as string[]
  const allCpvCodes = [...new Set(profileRows.flatMap(p => p.cpv_codes ?? []))] as string[]

  console.log(
    `[ingest] Building TED query with ${allCpvCodes.length} CPV codes and ${allKeywords.length} keywords from active profiles`
  )

  let totalIngested = 0
  let page = 1
  let hasMore = true
  let usedFallback = false

  try {
    while (hasMore) {
      const response = await tedClient.fetchRecentNoticesFiltered(
        since,
        { cpvCodes: allCpvCodes, keywords: allKeywords },
        page
      )

      if (!response.notices || response.notices.length === 0) {
        hasMore = false
        break
      }

      totalIngested += await ingestNotices(supabase, response.notices)
      hasMore = response.notices.length === 100
      page++
    }

    // If the filtered query returned nothing (possible when TED's query syntax
    // doesn't match the stored CPV/keyword format), fall back to a date-only
    // query so the matching pipeline always has fresh tenders to work with.
    if (totalIngested === 0 && (allCpvCodes.length > 0 || allKeywords.length > 0)) {
      console.log('[ingest] Filtered query returned 0 results; falling back to date-only query')
      usedFallback = true
      page = 1
      hasMore = true
      while (hasMore) {
        const response = await tedClient.fetchRecentContractNotices(since, page)
        if (!response.notices || response.notices.length === 0) {
          hasMore = false
          break
        }
        totalIngested += await ingestNotices(supabase, response.notices)
        hasMore = response.notices.length === 100
        page++
      }
    }

    return NextResponse.json({
      success: true,
      ingested: totalIngested,
      pages: page - 1,
      query_cpv_codes: allCpvCodes.length,
      query_keywords: allKeywords.length,
      fallback: usedFallback,
    })
  } catch (error) {
    console.error('TED ingestion error:', error)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }
}
