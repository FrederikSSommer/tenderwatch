/**
 * HILMA client — Finland's national procurement portal (hankintailmoitukset.fi).
 *
 * API key: register at https://hns-hilma-prod-apim.developer.azure-api.net
 *          → Products → avp-read → Subscribe (free, instant approval)
 *          Then set HILMA_API_KEY in your environment.
 *
 * Endpoint URLs below were inferred from the Azure APIM operation IDs in the
 * official docs (github.com/Hankintailmoitukset/hilma-api). Verify them in
 * the portal's API explorer after you have a key — the portal shows the full
 * URL for each operation when you click "Try it".
 */

// NOTE: Verify these paths in the HILMA API portal after registration.
const HILMA_BASE = 'https://hns-hilma-prod-apim.azure-api.net'
const SEARCH_PATH = '/avp/notices/search'       // operation: eform-search
const EFORMS_ONE  = '/external/read/v1/notice'  // operation: get-external-read-v1-notice-noticeid
const EFORMS_BATCH = '/external/read/v1/notices' // operation: get-external-read-v1-notices (≤50)

export interface HilmaSearchHit {
  noticeId: string
  title: string | null
  publishedDate: string | null
  noticeType: string | null
  cpvCodes: string[] | null
  organisationName: string | null
  countryCode: string | null
  estimatedValueEur: number | null
}

export interface HilmaSearchResponse {
  value: HilmaSearchHit[]
  '@odata.count'?: number
  '@odata.nextLink'?: string
}

export interface HilmaNoticeResponse {
  noticeId: string
  /** Base64-encoded eForms XML */
  noticeXml: string
}

export interface HilmaBatchResponse {
  notices: HilmaNoticeResponse[]
}

export class HilmaClient {
  private apiKey: string
  private lastRequestTime = 0
  private minInterval = 500

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private get headers() {
    return {
      'Ocp-Apim-Subscription-Key': this.apiKey,
      'Content-Type': 'application/json',
    }
  }

  private async throttle() {
    const now = Date.now()
    const wait = this.minInterval - (now - this.lastRequestTime)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    this.lastRequestTime = Date.now()
  }

  /**
   * Search for notices published on or after `since`.
   * Uses Azure Search OData filter syntax.
   * `skip` enables pagination (page size fixed at 50 per HILMA batch limit).
   */
  async searchNotices(since: Date, skip = 0): Promise<HilmaSearchResponse> {
    await this.throttle()
    const dateStr = since.toISOString().split('T')[0]
    const body = {
      filter: `publishedDate ge ${dateStr}`,
      orderby: 'publishedDate asc',
      top: 50,
      skip,
    }
    const res = await fetch(`${HILMA_BASE}${SEARCH_PATH}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HILMA search failed: ${res.status} ${res.statusText}`)
    return res.json()
  }

  /** Fetch full eForms XML for a single notice. */
  async fetchNotice(noticeId: string): Promise<HilmaNoticeResponse> {
    await this.throttle()
    const res = await fetch(`${HILMA_BASE}${EFORMS_ONE}/${encodeURIComponent(noticeId)}`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`HILMA notice fetch failed: ${res.status} ${res.statusText}`)
    return res.json()
  }

  /** Fetch full eForms XML for up to 50 notices in one request. */
  async fetchNoticesBatch(noticeIds: string[]): Promise<HilmaBatchResponse> {
    await this.throttle()
    const params = noticeIds.map(id => `noticeIds=${encodeURIComponent(id)}`).join('&')
    const res = await fetch(`${HILMA_BASE}${EFORMS_BATCH}?${params}`, {
      headers: this.headers,
    })
    if (!res.ok) throw new Error(`HILMA batch fetch failed: ${res.status} ${res.statusText}`)
    return res.json()
  }
}

export function getHilmaClient(): HilmaClient | null {
  const key = process.env.HILMA_API_KEY
  if (!key) return null
  return new HilmaClient(key)
}
