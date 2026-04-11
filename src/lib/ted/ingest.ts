import { tedClient } from './client'
import { parseTEDNotice } from './parser'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

export interface IngestResult {
  ingested: number
  pages: number
  errors: string[]
}

/**
 * Broad TED ingestion — pulls all recent contract notices into the shared
 * `tenders` table. Used by both the daily cron and the manual backfill.
 *
 * No per-user filtering. The same tender pool is then scored against any
 * profile that asks.
 */
export async function ingestRecentTenders(
  supabase: SupabaseClient<Database>,
  since: Date,
  opts: { maxPages?: number } = {}
): Promise<IngestResult> {
  const maxPages = opts.maxPages ?? 20
  const errors: string[] = []
  let totalIngested = 0
  let page = 1
  let hasMore = true

  while (hasMore && page <= maxPages) {
    try {
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
        if (error) errors.push(`Upsert: ${error.message}`)
        else totalIngested += parsed.length
      }

      hasMore = response.notices.length >= 100
      page++
    } catch (err) {
      errors.push(`TED fetch page ${page}: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }

  return { ingested: totalIngested, pages: page - 1, errors }
}
