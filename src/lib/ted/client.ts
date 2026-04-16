const TED_API_BASE = 'https://api.ted.europa.eu/v3'

/**
 * Builds a TED expert-syntax query string.
 *
 * TED's full-text index is multilingual — English keywords match notices written
 * in any EU language because TED normalises terms across languages at index time.
 * This means "patrol vessel" will match French notices about "patrouilleurs" etc.
 *
 * CPV codes and keywords are combined with OR (broad recall), then intersected
 * with a date lower-bound. Falls back to a date-only query if neither is provided.
 *
 * @example
 *   buildTEDQuery('20250101', ['35120000', '34520000'], ['patrol vessel', 'naval surveillance'])
 *   // → '(cpv=[35120000 OR 34520000] OR ("patrol vessel" OR "naval surveillance")) AND PD>=20250101'
 *
 *   buildTEDQuery('20250101', [], [])
 *   // → 'PD>=20250101'  (date-only fallback)
 */
export function buildTEDQuery(
  dateStr: string,
  cpvCodes: string[],
  keywords: string[]
): string {
  const parts: string[] = []

  if (cpvCodes.length > 0) {
    parts.push(`cpv=[${cpvCodes.join(' OR ')}]`)
  }

  if (keywords.length > 0) {
    // Strip embedded quotes to avoid breaking query syntax
    const kwPart = keywords
      .map(kw => `"${kw.replace(/"/g, '')}"`)
      .join(' OR ')
    parts.push(`(${kwPart})`)
  }

  const datePart = `PD>=${dateStr}`

  if (parts.length === 0) {
    return datePart
  }

  return `(${parts.join(' OR ')}) AND ${datePart}`
}

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

export interface TEDSearchResponse {
  notices: Record<string, unknown>[]
  total?: number
}

export class TEDClient {
  private lastRequestTime = 0
  private minInterval = 1000 // 1 second between requests

  private async throttle() {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minInterval - elapsed)
      )
    }
    this.lastRequestTime = Date.now()
  }

  async search(query: string, page = 1, limit = 100): Promise<TEDSearchResponse> {
    await this.throttle()

    const searchBody = {
      query,
      fields: TED_FIELDS,
      limit,
      page,
      scope: 2,
    }

    const response = await fetch(`${TED_API_BASE}/notices/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchBody),
    })

    if (!response.ok) {
      throw new Error(
        `TED API error: ${response.status} ${response.statusText}`
      )
    }

    return response.json()
  }

  async fetchRecentContractNotices(
    since: Date,
    page = 1
  ): Promise<TEDSearchResponse> {
    const dateStr = since.toISOString().split('T')[0].replace(/-/g, '')
    return this.search(`PD>=${dateStr}`, page, 100)
  }

  /**
   * Fetch recent notices filtered by CPV codes and/or free-text keywords.
   * When both are provided they are OR'd together for maximum recall — a tender
   * is fetched if it matches either signal.
   * Falls back to a date-only query if neither filter is supplied.
   */
  async fetchRecentNoticesFiltered(
    since: Date,
    filters: { cpvCodes?: string[]; keywords?: string[] } = {},
    page = 1
  ): Promise<TEDSearchResponse> {
    const dateStr = since.toISOString().split('T')[0].replace(/-/g, '')
    const query = buildTEDQuery(dateStr, filters.cpvCodes ?? [], filters.keywords ?? [])
    return this.search(query, page, 100)
  }
}

export const tedClient = new TEDClient()
