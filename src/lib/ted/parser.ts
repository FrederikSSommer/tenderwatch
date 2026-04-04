import { TEDNotice } from './types'

export interface ParsedTender {
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
  raw_data: any
}

export function parseTEDNotice(notice: TEDNotice): ParsedTender {
  const cpvCodes = (notice.OC || []).map((code) => code.replace(/-\d$/, ''))

  return {
    source: 'ted',
    external_id: notice.ND,
    title: notice.TI || 'Untitled',
    description: null, // Full description requires separate API call
    buyer_name: notice.AU || null,
    buyer_country: notice.CY || null,
    cpv_codes: cpvCodes,
    procedure_type: notice.PR || null,
    tender_type: notice.NC || null,
    estimated_value_eur: notice.TVH || notice.TVL || null,
    currency: 'EUR',
    submission_deadline: notice.DT
      ? new Date(notice.DT).toISOString()
      : null,
    publication_date: notice.DD,
    document_url: null,
    ted_url: `https://ted.europa.eu/en/notice/-/${notice.ND}`,
    language: notice.OL || 'EN',
    raw_data: notice,
  }
}
