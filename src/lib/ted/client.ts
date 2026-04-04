import { TEDSearchParams, TEDSearchResponse, TEDNotice } from './types'

const TED_API_BASE = 'https://api.ted.europa.eu/v3'

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

  async search(params: TEDSearchParams): Promise<TEDSearchResponse> {
    await this.throttle()

    const searchBody = {
      query: params.q,
      pageSize: params.pageSize ?? 100,
      page: params.pageNum ?? 1,
      scope: params.scope ?? 3,
      sortField: params.sortField ?? 'DD',
      sortOrder: params.sortOrder ?? 'desc',
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

  async getNotice(noticeId: string): Promise<TEDNotice> {
    await this.throttle()
    const response = await fetch(`${TED_API_BASE}/notices/${noticeId}`)
    if (!response.ok) {
      throw new Error(`TED API error: ${response.status}`)
    }
    return response.json()
  }

  async fetchRecentContractNotices(
    since: Date,
    page = 1
  ): Promise<TEDSearchResponse> {
    const dateStr = since.toISOString().split('T')[0].replace(/-/g, '')
    return this.search({
      q: `PD>=${dateStr} AND TD=[3]`,
      pageNum: page,
      pageSize: 100,
      sortField: 'DD',
      sortOrder: 'desc',
    })
  }
}

export const tedClient = new TEDClient()
