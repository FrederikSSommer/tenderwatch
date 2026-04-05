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
}

export const tedClient = new TEDClient()
