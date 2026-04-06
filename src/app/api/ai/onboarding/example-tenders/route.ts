import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

const TED_API_BASE = 'https://api.ted.europa.eu/v3'
const TED_FIELDS = [
  'notice-title',
  'description-glo',
  'organisation-country-buyer',
  'buyer-name',
  'classification-cpv',
  'estimated-value-lot',
  'publication-date',
  'notice-type',
]

const COUNTRY_MAP: Record<string, string> = {
  'DK': 'DNK', 'NO': 'NOR', 'SE': 'SWE', 'DE': 'DEU',
  'NL': 'NLD', 'FI': 'FIN', 'FR': 'FRA', 'UK': 'GBR',
  'PL': 'POL', 'ES': 'ESP', 'IT': 'ITA', 'BE': 'BEL',
  'AT': 'AUT', 'PT': 'PRT', 'IE': 'IRL', 'CZ': 'CZE',
  'RO': 'ROU', 'BG': 'BGR', 'HR': 'HRV', 'LT': 'LTU',
  'LV': 'LVA', 'EE': 'EST',
}

function extractMultilingual(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return typeof obj === 'string' ? obj : null
  if (Array.isArray(obj)) return obj.map(d => extractMultilingual(d)).filter(Boolean).join(' ') || null
  const t = obj as Record<string, unknown>
  for (const lang of ['eng', 'dan', ...Object.keys(t)]) {
    const val = t[lang]
    if (typeof val === 'string' && val) return val
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string') return val[0]
  }
  return null
}

async function searchTED(query: string, limit = 10): Promise<Record<string, unknown>[]> {
  try {
    const response = await fetch(`${TED_API_BASE}/notices/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, fields: TED_FIELDS, limit, page: 1, scope: 2 }),
    })
    if (!response.ok) return []
    const data = await response.json()
    return data.notices || []
  } catch {
    return []
  }
}

function parseTender(n: Record<string, unknown>) {
  const cpvRaw = n['classification-cpv']
  const cpvCodes = Array.isArray(cpvRaw)
    ? [...new Set(cpvRaw.map((c: unknown) => String(c)))]
    : []

  const countryRaw = n['organisation-country-buyer']
  const country = Array.isArray(countryRaw) ? countryRaw[0] : countryRaw

  const valueRaw = n['estimated-value-lot']
  const value = typeof valueRaw === 'number' ? valueRaw
    : Array.isArray(valueRaw) && typeof valueRaw[0] === 'number' ? valueRaw[0]
    : null

  const desc = extractMultilingual(n['description-glo'])

  return {
    id: n['publication-number'] as string,
    title: extractMultilingual(n['notice-title']) || 'Untitled',
    buyerName: extractMultilingual(n['buyer-name']),
    buyerCountry: typeof country === 'string' ? country : null,
    cpvCodes,
    estimatedValue: value,
    description: desc ? desc.slice(0, 250) : null,
    tedUrl: `https://ted.europa.eu/en/notice/-/detail/${n['publication-number']}`,
    noticeType: n['notice-type'] as string || null,
    publicationDate: n['publication-date'] as string || null,
  }
}

export async function POST(request: NextRequest) {
  const { description, sectors, subsectors, countries, buyers } = await request.json()

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 60)
  const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '')

  // Step 1: Ask Claude for CPV codes and keywords (NOT TED query syntax)
  const prompt = `You are an EU procurement expert. Based on these interests, suggest CPV codes and search keywords.

Company: "${description}"
Sectors: ${(sectors || []).join(', ')}
Specific interests: ${(subsectors || []).join(', ')}

Return ONLY a JSON object:
{
  "cpv_2digit": ["34", "71", "50"],
  "keywords": ["maritime", "naval", "ship design", "defence"]
}

cpv_2digit: 3-5 two-digit CPV division codes (the first 2 digits of relevant 8-digit CPV codes)
keywords: 5-8 English keywords that would appear in relevant tender titles`

  let cpvPrefixes: string[] = []
  let keywords: string[] = []

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      cpvPrefixes = parsed.cpv_2digit || []
      keywords = parsed.keywords || []
    }
  } catch {
    // If Claude fails, use a generic approach
    keywords = (sectors || []).slice(0, 3)
  }

  // Step 2: Build TED queries with known-good syntax
  const tedCountries = (countries || [])
    .map((c: string) => COUNTRY_MAP[c] || c)
    .filter(Boolean)

  const queries: string[] = []

  // Query 1: CPV-based (most reliable for finding relevant tenders)
  if (cpvPrefixes.length > 0) {
    const cpvFilter = cpvPrefixes.slice(0, 4).map(c => `classification-cpv=${c}*`).join(' OR ')
    if (tedCountries.length > 0 && tedCountries.length <= 5) {
      const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queries.push(`PD>=${dateStr} AND (${cpvFilter}) AND (${countryFilter})`)
    }
    queries.push(`PD>=${dateStr} AND (${cpvFilter})`)
  }

  // Query 2: Keyword full-text search per country
  if (keywords.length > 0 && tedCountries.length > 0) {
    const kwFilter = keywords.slice(0, 4).map(k => `FT~"${k}"`).join(' OR ')
    const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
    queries.push(`PD>=${dateStr} AND (${kwFilter}) AND (${countryFilter})`)
  }

  // Query 3: Buyer-specific searches (most targeted for finding specific org tenders)
  if (buyers && buyers.length > 0) {
    for (const buyer of buyers.slice(0, 5)) {
      const buyerName = typeof buyer === 'string' ? buyer : buyer.name
      if (!buyerName) continue
      // Search by buyer name with date filter
      queries.push(`PD>=${dateStr} AND FT~"${buyerName}"`)
    }
    // Also try buyer + CPV combo
    if (cpvPrefixes.length > 0) {
      const cpvFilter = cpvPrefixes.slice(0, 3).map(c => `classification-cpv=${c}*`).join(' OR ')
      for (const buyer of buyers.slice(0, 3)) {
        const buyerName = typeof buyer === 'string' ? buyer : buyer.name
        if (!buyerName) continue
        queries.push(`PD>=${dateStr} AND FT~"${buyerName}" AND (${cpvFilter})`)
      }
    }
  }

  // Query 4: Keywords only (broadest)
  if (keywords.length > 0) {
    const kwFilter = keywords.slice(0, 3).map(k => `FT~"${k}"`).join(' OR ')
    queries.push(`PD>=${dateStr} AND (${kwFilter})`)
  }

  // Step 3: Fetch from TED with all queries
  const allTenders: Record<string, unknown>[] = []
  const seenIds = new Set<string>()

  for (const query of queries) {
    const notices = await searchTED(query, 8)
    for (const notice of notices) {
      const id = notice['publication-number'] as string
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        allTenders.push(notice)
      }
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 300))
  }

  const tenders = allTenders.slice(0, 15).map(parseTender)

  return NextResponse.json({
    tenders,
    queriesRun: queries.length,
    cpvPrefixes,
    keywords,
  })
}
