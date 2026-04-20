/**
 * Parse a HILMA eForms notice into a ParsedTender.
 *
 * eForms XML uses UBL namespaces (cbc/cac) plus EU-specific extensions
 * (efbc/efac/efext). fast-xml-parser strips namespace prefixes so we
 * access e.g. `cac:ProcurementProject` as just `ProcurementProject`.
 *
 * Key Business Terms extracted:
 *   BT-701  Notice identifier      → external_id
 *   BT-05   Notice dispatch date   → publication_date
 *   BT-500  Organisation name      → buyer_name
 *   BT-507  Organisation country   → buyer_country
 *   BT-21   Title                  → title
 *   BT-24   Description            → description
 *   BT-26   CPV code               → cpv_codes
 *   BT-27   Estimated value        → estimated_value_eur
 *   BT-131  Deadline               → submission_deadline
 */

import { XMLParser } from 'fast-xml-parser'
import type { ParsedTender } from '@/lib/ted/parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,        // strips cbc:, cac:, efbc: etc.
  isArray: (name) =>
    ['ContractingParty', 'ProcurementProjectLot', 'ItemClassificationCode',
     'TenderingProcess', 'AdditionalCommodityClassification'].includes(name),
  parseAttributeValue: true,
  parseTagValue: true,
})

function asArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return []
  return Array.isArray(val) ? val : [val]
}

function extractText(node: unknown): string | null {
  if (!node) return null
  if (typeof node === 'string') return node || null
  if (typeof node === 'number') return String(node)
  // fast-xml-parser puts text content in #text when mixed with attributes
  const n = node as Record<string, unknown>
  if (n['#text'] !== undefined) return String(n['#text']) || null
  return null
}

function pickLang(node: unknown): string | null {
  if (!node) return null
  const items = asArray(node as never)
  if (items.length === 0) return null
  // Prefer English, then Finnish, then first available
  const byLang = (lang: string) =>
    items.find((i: unknown) => {
      const item = i as Record<string, unknown>
      return item['@_languageID'] === lang || item['@_Language'] === lang
    })
  const hit = byLang('ENG') || byLang('FIN') || byLang('SWE') || items[0]
  return extractText(hit)
}

export function parseHilmaEforms(
  xml: string,
  noticeIdFallback: string,
): ParsedTender | null {
  try {
    const doc = parser.parse(xml) as Record<string, unknown>

    // Root element can be ContractNotice, PriorInformationNotice, etc.
    const rootKey = Object.keys(doc).find(k =>
      k.endsWith('Notice') || k.endsWith('notice')
    )
    if (!rootKey) return null
    const root = doc[rootKey] as Record<string, unknown>

    // ── Notice ID ────────────────────────────────────────────────────────────
    // BT-701: <cbc:ID schemeName="notice-identifier">...</cbc:ID>
    let noticeId = noticeIdFallback
    const ids = asArray(root['ID'])
    for (const id of ids) {
      const idNode = id as Record<string, unknown>
      if (idNode['@_schemeName'] === 'notice-identifier') {
        noticeId = extractText(id) || noticeIdFallback
        break
      }
    }
    if (!noticeId) noticeId = extractText(root['ID']) || noticeIdFallback

    // ── Publication date ─────────────────────────────────────────────────────
    const issueDateRaw = extractText(root['IssueDate']) ||
      extractText((root['NoticeTypeCode'] as Record<string, unknown>)?.['IssueDate'])
    let publicationDate: string
    try {
      publicationDate = issueDateRaw
        ? new Date(issueDateRaw).toISOString().split('T')[0]
        : new Date().toISOString().split('T')[0]
    } catch {
      publicationDate = new Date().toISOString().split('T')[0]
    }

    // ── Contracting party ────────────────────────────────────────────────────
    const parties = asArray(root['ContractingParty'])
    let buyerName: string | null = null
    let buyerCountry: string | null = null
    for (const cp of parties) {
      const party = (cp as Record<string, unknown>)['Party'] as Record<string, unknown> | undefined
      if (!party) continue
      if (!buyerName) {
        const pName = party['PartyName'] as Record<string, unknown> | undefined
        buyerName = pickLang(pName?.['Name']) ?? extractText(pName?.['Name']) ?? null
      }
      if (!buyerCountry) {
        const addr = party['PostalAddress'] as Record<string, unknown> | undefined
        const country = addr?.['Country'] as Record<string, unknown> | undefined
        buyerCountry = extractText(country?.['IdentificationCode']) ?? null
      }
      if (buyerName && buyerCountry) break
    }

    // ── Procurement project (top-level) ──────────────────────────────────────
    const proj = root['ProcurementProject'] as Record<string, unknown> | undefined

    const title = pickLang(proj?.['Name']) ??
      extractText(proj?.['Name']) ??
      'Untitled'

    const description = pickLang(proj?.['Description']) ??
      extractText(proj?.['Description']) ??
      null

    // CPV: main + additional
    const mainCpv = (proj?.['MainCommodityClassification'] as Record<string, unknown>)
      ?.['ItemClassificationCode']
    const additionalCpvs = asArray(
      (proj?.['AdditionalCommodityClassification'] as unknown[])
    ).map(a => (a as Record<string, unknown>)['ItemClassificationCode'])

    const allCpvNodes = [mainCpv, ...additionalCpvs].filter(Boolean)

    // Also pick up lot-level CPVs
    const lots = asArray(root['ProcurementProjectLot'])
    for (const lot of lots) {
      const lotProj = (lot as Record<string, unknown>)['ProcurementProject'] as
        Record<string, unknown> | undefined
      if (!lotProj) continue
      const lMain = (lotProj['MainCommodityClassification'] as Record<string, unknown>)
        ?.['ItemClassificationCode']
      if (lMain) allCpvNodes.push(lMain)
      const lAdds = asArray(lotProj['AdditionalCommodityClassification'] as unknown[])
        .map(a => (a as Record<string, unknown>)['ItemClassificationCode'])
      allCpvNodes.push(...lAdds.filter(Boolean))
    }

    const cpvCodes = [
      ...new Set(
        allCpvNodes
          .map(n => extractText(n))
          .filter((c): c is string => !!c)
          .map(c => c.replace(/-\d+$/, '').padEnd(8, '0'))
      ),
    ]

    // ── Estimated value ──────────────────────────────────────────────────────
    let estimatedValue: number | null = null
    const budgetAmount = (proj?.['BudgetAmount'] as Record<string, unknown> | undefined)
    if (budgetAmount) {
      const raw = extractText(budgetAmount['EstimatedOverallContractAmount']) ??
        extractText(budgetAmount['TotalAmount'])
      if (raw) estimatedValue = parseFloat(raw) || null
    }
    // Fallback: aggregate lot values
    if (!estimatedValue) {
      let lotTotal = 0
      for (const lot of lots) {
        const lotBudget = ((lot as Record<string, unknown>)['ProcurementProject'] as
          Record<string, unknown> | undefined)?.['BudgetAmount'] as
          Record<string, unknown> | undefined
        if (!lotBudget) continue
        const v = extractText(lotBudget['EstimatedOverallContractAmount']) ??
          extractText(lotBudget['TotalAmount'])
        if (v) lotTotal += parseFloat(v) || 0
      }
      if (lotTotal > 0) estimatedValue = lotTotal
    }

    // ── Submission deadline ──────────────────────────────────────────────────
    let deadline: string | null = null
    for (const lot of lots) {
      const terms = (lot as Record<string, unknown>)['TenderingTerms'] as
        Record<string, unknown> | undefined
      const dl = terms?.['TenderSubmissionDeadlinePeriod'] as
        Record<string, unknown> | undefined
      const dlDate = extractText(dl?.['EndDate'])
      if (dlDate) {
        try { deadline = new Date(dlDate).toISOString() } catch { /* skip */ }
        break
      }
    }

    // ── Notice type ──────────────────────────────────────────────────────────
    const noticeTypeNode = root['NoticeTypeCode'] ??
      root['ContractingActivity'] ??
      root['ProcedureCode']
    const noticeType = extractText(noticeTypeNode)

    return {
      source: 'ted',  // reuse 'ted' source type; deduplication is on external_id
      external_id: noticeId,
      title,
      description,
      buyer_name: buyerName,
      buyer_country: buyerCountry,
      cpv_codes: cpvCodes,
      procedure_type: null,
      tender_type: noticeType,
      estimated_value_eur: estimatedValue,
      currency: 'EUR',
      submission_deadline: deadline,
      publication_date: publicationDate,
      document_url: null,
      ted_url: null,
      language: 'FI',
      raw_data: null,
    }
  } catch (err) {
    console.error('[hilma] Failed to parse eForms notice:', err)
    return null
  }
}

/**
 * Parse a HILMA search hit (JSON from the search index) into a ParsedTender.
 * Used when the search index has enough fields to skip full XML fetch.
 * Returns null if critical fields (title, CPV) are missing.
 */
export function parseHilmaSearchHit(
  hit: {
    noticeId: string
    title: string | null
    publishedDate: string | null
    noticeType: string | null
    cpvCodes: string[] | null
    organisationName: string | null
    countryCode: string | null
    estimatedValueEur: number | null
  }
): ParsedTender | null {
  if (!hit.noticeId) return null

  const cpvCodes = (hit.cpvCodes ?? [])
    .map(c => c.replace(/-\d+$/, '').padEnd(8, '0'))

  let publicationDate: string
  try {
    publicationDate = hit.publishedDate
      ? new Date(hit.publishedDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  } catch {
    publicationDate = new Date().toISOString().split('T')[0]
  }

  return {
    source: 'ted',
    external_id: hit.noticeId,
    title: hit.title || 'Untitled',
    description: null,
    buyer_name: hit.organisationName,
    buyer_country: hit.countryCode,
    cpv_codes: cpvCodes,
    procedure_type: null,
    tender_type: hit.noticeType,
    estimated_value_eur: hit.estimatedValueEur ?? null,
    currency: 'EUR',
    submission_deadline: null,
    publication_date: publicationDate,
    document_url: null,
    ted_url: null,
    language: 'FI',
    raw_data: null,
  }
}
