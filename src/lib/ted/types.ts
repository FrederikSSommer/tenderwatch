export interface TEDNotice {
  ND: string // Notice number
  TI: string // Title
  CY: string // Country
  DD: string // Document date
  DT: string | null // Deadline
  NC: string | null // Contract nature code
  PR: string | null // Procedure type
  TY: string | null // Bid type
  AC: string | null // Award criteria
  RC: string | null // NUTS code
  OC: string[] // CPV codes
  TW: string | null // Town
  AU: string | null // Authority name
  OL: string | null // Original language
  TVH: number | null // Total value high (estimated)
  TVL: number | null // Total value low
}

export interface TEDSearchResponse {
  results: TEDNotice[]
  total: number
  page: number
  pageSize: number
}

export interface TEDSearchParams {
  q: string
  scope?: number
  fields?: string[]
  sortField?: string
  sortOrder?: 'asc' | 'desc'
  pageNum?: number
  pageSize?: number
}
