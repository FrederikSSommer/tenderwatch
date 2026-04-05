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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServiceClient()
  const since = new Date()
  since.setDate(since.getDate() - 1)

  let totalIngested = 0
  let page = 1
  let hasMore = true

  try {
    while (hasMore) {
      const response = await tedClient.fetchRecentContractNotices(since, page)

      if (!response.notices || response.notices.length === 0) {
        hasMore = false
        break
      }

      const parsed = response.notices
        .map(parseTEDNotice)
        .filter((t): t is NonNullable<typeof t> => t !== null)

      if (parsed.length > 0) {
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
        totalIngested += parsed.length
      }

      hasMore = response.notices.length === 100
      page++
    }

    return NextResponse.json({ success: true, ingested: totalIngested, pages: page - 1 })
  } catch (error) {
    console.error('TED ingestion error:', error)
    return NextResponse.json({ error: 'Ingestion failed' }, { status: 500 })
  }
}
