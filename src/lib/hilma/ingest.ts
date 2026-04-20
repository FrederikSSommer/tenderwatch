import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { getHilmaClient, HilmaSearchHit } from './client'
import { parseHilmaSearchHit, parseHilmaEforms } from './parser'
import type { ParsedTender } from '@/lib/ted/parser'

export interface HilmaIngestResult {
  ingested: number
  pages: number
  errors: string[]
  skipped: boolean  // true when HILMA_API_KEY is not set
}

const BATCH_SIZE = 50

/**
 * Fetch recent HILMA notices and upsert them into the shared `tenders` table.
 *
 * Strategy:
 *  1. Search index (JSON) gives us title/CPV/buyer/date/value per hit.
 *  2. For hits where description is null, fetch full eForms XML in batches.
 *  3. Upsert using (source, external_id) — same conflict key as TED, so
 *     cross-posted notices won't duplicate (HILMA uses a different ID format
 *     to TED, so duplicates are rare in practice).
 */
export async function ingestRecentHilmaNotices(
  supabase: SupabaseClient<Database>,
  since: Date,
  opts: { maxPages?: number } = {}
): Promise<HilmaIngestResult> {
  const client = getHilmaClient()
  if (!client) {
    return { ingested: 0, pages: 0, errors: [], skipped: true }
  }

  const maxPages = opts.maxPages ?? 20
  const errors: string[] = []
  let totalIngested = 0
  let page = 0
  let hasMore = true

  while (hasMore && page < maxPages) {
    const skip = page * BATCH_SIZE
    let hits: HilmaSearchHit[]

    try {
      const res = await client.searchNotices(since, skip)
      hits = res.value ?? []
    } catch (err) {
      errors.push(`HILMA search (skip=${skip}): ${err instanceof Error ? err.message : String(err)}`)
      break
    }

    if (hits.length === 0) break

    // Parse what we can from the search index
    const fromSearch: ParsedTender[] = hits
      .map(h => parseHilmaSearchHit(h))
      .filter((t): t is ParsedTender => t !== null)

    // Enrich with full XML for notices that are missing description
    // (descriptions are often absent from the search index)
    const needsXml = fromSearch.filter(t => !t.description)
    if (needsXml.length > 0) {
      const batchIds = needsXml.map(t => t.external_id)
      try {
        const batchRes = await client.fetchNoticesBatch(batchIds)
        for (const notice of batchRes.notices ?? []) {
          const xml = Buffer.from(notice.noticeXml, 'base64').toString('utf-8')
          const full = parseHilmaEforms(xml, notice.noticeId)
          if (!full) continue
          const idx = fromSearch.findIndex(t => t.external_id === notice.noticeId)
          if (idx !== -1) {
            // Merge: XML description + deadline + value over the search-hit stub
            fromSearch[idx] = {
              ...fromSearch[idx],
              description: full.description,
              submission_deadline: full.submission_deadline,
              estimated_value_eur: full.estimated_value_eur ?? fromSearch[idx].estimated_value_eur,
              cpv_codes: full.cpv_codes.length > 0 ? full.cpv_codes : fromSearch[idx].cpv_codes,
            }
          }
        }
      } catch (err) {
        // Non-fatal: search data is still usable
        errors.push(`HILMA XML batch (page ${page}): ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (fromSearch.length > 0) {
      const { error } = await supabase.from('tenders').upsert(
        fromSearch.map(t => ({
          source: 'ted' as const,
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
      if (error) errors.push(`Upsert (page ${page}): ${error.message}`)
      else totalIngested += fromSearch.length
    }

    hasMore = hits.length === BATCH_SIZE
    page++
  }

  return { ingested: totalIngested, pages: page, errors, skipped: false }
}
