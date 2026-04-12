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
  raw_data: unknown
}

// Extract from multilingual object: { eng: "...", dan: "..." } or { eng: ["..."], dan: ["..."] }
function extractMultilingual(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return typeof obj === 'string' ? obj : null
  if (Array.isArray(obj)) {
    return obj.map(d => extractMultilingual(d)).filter(Boolean).join(' ') || null
  }
  const t = obj as Record<string, unknown>
  for (const lang of ['eng', 'dan', ...Object.keys(t)]) {
    const val = t[lang]
    if (typeof val === 'string' && val) return val
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0]
  }
  return null
}

export function parseTEDNotice(notice: Record<string, unknown>): ParsedTender | null {
  try {
    const pubNumber = notice['publication-number'] as string | undefined
    if (!pubNumber) return null

    const title = extractMultilingual(notice['notice-title']) || 'Untitled'
    const description = extractMultilingual(notice['description-glo'])
    const buyerName = extractMultilingual(notice['buyer-name'])

    // Country
    const countryRaw = notice['organisation-country-buyer']
    const buyerCountry = Array.isArray(countryRaw)
      ? (countryRaw[0] as string) || null
      : typeof countryRaw === 'string'
        ? countryRaw
        : null

    // CPV codes — deduplicated, normalised to 8 digits
    const cpvRaw = notice['classification-cpv']
    const cpvCodes = Array.isArray(cpvRaw)
      ? [...new Set(cpvRaw.map(c => {
          const stripped = String(c).replace(/-\d+$/, '')
          // Pad to 8 digits (TED sometimes returns 7 or fewer)
          return stripped.padEnd(8, '0')
        }))]
      : []

    // Value
    const valueRaw = notice['estimated-value-lot']
    let estimatedValue: number | null = null
    if (typeof valueRaw === 'number') {
      estimatedValue = valueRaw
    } else if (Array.isArray(valueRaw) && valueRaw.length > 0) {
      estimatedValue = typeof valueRaw[0] === 'number' ? valueRaw[0] : parseFloat(String(valueRaw[0])) || null
    }

    // Deadline
    const deadlineRaw = notice['deadline-receipt-tender-date-lot']
    let deadline: string | null = null
    if (deadlineRaw) {
      const dl = Array.isArray(deadlineRaw) ? deadlineRaw[0] : deadlineRaw
      if (dl) {
        try { deadline = new Date(String(dl)).toISOString() } catch { /* skip */ }
      }
    }

    // Publication date
    const pubDateRaw = notice['publication-date']
    let pubDate: string
    if (pubDateRaw) {
      const dateStr = String(pubDateRaw).split('+')[0].split('T')[0]
      const d = new Date(dateStr)
      pubDate = isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : dateStr
    } else {
      pubDate = new Date().toISOString().split('T')[0]
    }

    const noticeType = typeof notice['notice-type'] === 'string' ? notice['notice-type'] : null
    const contractNature = Array.isArray(notice['contract-nature'])
      ? (notice['contract-nature'][0] as string) || null
      : typeof notice['contract-nature'] === 'string'
        ? notice['contract-nature']
        : null

    return {
      source: 'ted',
      external_id: pubNumber,
      title,
      description,
      buyer_name: buyerName,
      buyer_country: buyerCountry,
      cpv_codes: cpvCodes,
      procedure_type: contractNature,
      tender_type: noticeType,
      estimated_value_eur: estimatedValue,
      currency: 'EUR',
      submission_deadline: deadline,
      publication_date: pubDate,
      document_url: null,
      ted_url: `https://ted.europa.eu/en/notice/-/detail/${pubNumber}`,
      language: 'EN',
      raw_data: notice,
    }
  } catch (err) {
    console.error('Failed to parse TED notice:', err)
    return null
  }
}
