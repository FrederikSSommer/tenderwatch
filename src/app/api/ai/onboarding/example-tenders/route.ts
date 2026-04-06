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

  // Map country codes to language names for native keyword generation
  const COUNTRY_LANG: Record<string, string> = {
    DK: 'Danish', NO: 'Norwegian', SE: 'Swedish', DE: 'German',
    NL: 'Dutch', FI: 'Finnish', FR: 'French', PL: 'Polish',
    ES: 'Spanish', IT: 'Italian', BE: 'French/Dutch',
  }
  const targetLangs = (countries || []).map((c: string) => COUNTRY_LANG[c]).filter(Boolean)
  const langNote = targetLangs.length > 0
    ? `\nIMPORTANT: Many tenders on TED are titled in the local language. Include keywords in ${targetLangs.join(', ')} as well. For example, Danish maritime tenders use words like "fartøj" (vessel), "værft" (shipyard), "marine", "sejlende" (sailing).`
    : ''

  // Step 1: Ask Claude for CPV codes and keywords (NOT TED query syntax)
  const prompt = `You are an EU procurement expert. Based on these interests, suggest CPV codes and search keywords.

Company: "${description}"
Sectors: ${(sectors || []).join(', ')}
Specific interests: ${(subsectors || []).join(', ')}
Target countries: ${(countries || []).join(', ')}
${langNote}

Return ONLY a JSON object:
{
  "cpv_2digit": ["34", "71", "50"],
  "keywords": ["maritime", "naval", "ship design", "defence"],
  "native_keywords": ["fartøj", "værft", "forsvar", "marine"]
}

cpv_2digit: 3-5 two-digit CPV division codes (the first 2 digits of relevant 8-digit CPV codes). Include 50 (repair/maintenance) if relevant.
keywords: 5-8 English keywords that would appear in relevant tender titles
native_keywords: 3-6 keywords in the local language(s) of the target countries that would appear in tender titles on TED`

  let cpvPrefixes: string[] = []
  let keywords: string[] = []

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      cpvPrefixes = parsed.cpv_2digit || []
      // Combine English + native keywords for broader search
      keywords = [...(parsed.keywords || []), ...(parsed.native_keywords || [])]
    }
  } catch {
    // If Claude fails, use a generic approach
    keywords = (sectors || []).slice(0, 3)
  }

  // Step 2: Build TED queries with known-good syntax
  const tedCountries = (countries || [])
    .map((c: string) => COUNTRY_MAP[c] || c)
    .filter(Boolean)

  // Helper: extract buyer search filter from buyer object
  function getBuyerFilter(buyer: Record<string, unknown>): string | null {
    const searchTerms = buyer.searchTerms as string[] | undefined
    if (searchTerms && searchTerms.length > 0) {
      return searchTerms.map((t: string) => `FT~"${t}"`).join(' AND ')
    }
    const name = (typeof buyer === 'string' ? buyer : buyer.name) as string
    if (!name) return null
    const skipWords = new Set(['and', 'the', 'for', 'of', 'de', 'des', 'du', 'og', 'for', 'der', 'die', 'und'])
    const words = name.split(/[\s,.-]+/).filter((w: string) => w.length > 5 && !skipWords.has(w.toLowerCase()))
    return words[0] ? `FT~"${words[0]}"` : null
  }

  // Build queries in priority tiers — each tier gets its own bucket to ensure diversity
  const queryTiers: string[][] = [[], [], [], []]

  // Tier 0 (BEST): Buyer + topic keywords — use ALL keywords (English + native) for max coverage
  if (buyers && buyers.length > 0 && keywords.length > 0) {
    // Use up to 8 keywords to cast a wide net within buyer results
    const kwFilter = keywords.slice(0, 8).map(k => `FT~"${k}"`).join(' OR ')
    for (const buyer of buyers.slice(0, 4)) {
      const bf = getBuyerFilter(buyer as Record<string, unknown>)
      const buyerCountry = COUNTRY_MAP[(buyer as Record<string, unknown>).country as string] || (buyer as Record<string, unknown>).country
      if (!bf) continue
      if (buyerCountry) {
        queryTiers[0].push(`PD>=${dateStr} AND ${bf} AND (${kwFilter}) AND organisation-country-buyer=${buyerCountry}`)
      } else {
        queryTiers[0].push(`PD>=${dateStr} AND ${bf} AND (${kwFilter})`)
      }
    }
  }

  // Tier 0b: Buyer + CPV codes
  if (buyers && buyers.length > 0 && cpvPrefixes.length > 0) {
    const cpvFilter = cpvPrefixes.slice(0, 3).map(c => `classification-cpv=${c}*`).join(' OR ')
    for (const buyer of buyers.slice(0, 3)) {
      const bf = getBuyerFilter(buyer as Record<string, unknown>)
      const buyerCountry = COUNTRY_MAP[(buyer as Record<string, unknown>).country as string] || (buyer as Record<string, unknown>).country
      if (!bf) continue
      if (buyerCountry) {
        queryTiers[0].push(`PD>=${dateStr} AND ${bf} AND (${cpvFilter}) AND organisation-country-buyer=${buyerCountry}`)
      } else {
        queryTiers[0].push(`PD>=${dateStr} AND ${bf} AND (${cpvFilter})`)
      }
    }
  }

  // Tier 1: CPV-based with country filter (topic-relevant, no specific buyer)
  if (cpvPrefixes.length > 0) {
    const cpvFilter = cpvPrefixes.slice(0, 4).map(c => `classification-cpv=${c}*`).join(' OR ')
    if (tedCountries.length > 0 && tedCountries.length <= 5) {
      const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queryTiers[1].push(`PD>=${dateStr} AND (${cpvFilter}) AND (${countryFilter})`)
    }
    queryTiers[1].push(`PD>=${dateStr} AND (${cpvFilter})`)
  }

  // Tier 1b: Keyword search with country
  if (keywords.length > 0 && tedCountries.length > 0) {
    const kwFilter = keywords.slice(0, 4).map(k => `FT~"${k}"`).join(' OR ')
    const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
    queryTiers[1].push(`PD>=${dateStr} AND (${kwFilter}) AND (${countryFilter})`)
  }

  // Tier 2: Buyer-only (broad — all tenders from that org, no topic filter)
  if (buyers && buyers.length > 0) {
    for (const buyer of buyers.slice(0, 3)) {
      const bf = getBuyerFilter(buyer as Record<string, unknown>)
      const buyerCountry = COUNTRY_MAP[(buyer as Record<string, unknown>).country as string] || (buyer as Record<string, unknown>).country
      if (!bf) continue
      if (buyerCountry) {
        queryTiers[2].push(`PD>=${dateStr} AND ${bf} AND organisation-country-buyer=${buyerCountry}`)
      } else {
        queryTiers[2].push(`PD>=${dateStr} AND ${bf}`)
      }
    }
  }

  // Tier 3: Keywords only (broadest fallback)
  if (keywords.length > 0) {
    const kwFilter = keywords.slice(0, 3).map(k => `FT~"${k}"`).join(' OR ')
    queryTiers[3].push(`PD>=${dateStr} AND (${kwFilter})`)
  }

  // Step 3: Fetch from TED — collect results per tier, then interleave for diversity
  const tierResults: Record<string, unknown>[][] = [[], [], [], []]
  const seenIds = new Set<string>()

  for (let tier = 0; tier < queryTiers.length; tier++) {
    for (const query of queryTiers[tier]) {
      // Tier 0 (buyer+topic) gets more results since they're most targeted
      const fetchLimit = tier === 0 ? 15 : 8
      const notices = await searchTED(query, fetchLimit)
      for (const notice of notices) {
        const id = notice['publication-number'] as string
        if (id && !seenIds.has(id)) {
          seenIds.add(id)
          tierResults[tier].push(notice)
        }
      }
      await new Promise(r => setTimeout(r, 300))
    }
  }

  // Interleave: take up to 8 from tier 0 (buyer+topic), 4 from tier 1 (topic), 2 from tier 2 (buyer-only), 1 from tier 3 (broad)
  const limits = [8, 4, 2, 1]
  const allTenders: Record<string, unknown>[] = []
  for (let tier = 0; tier < tierResults.length; tier++) {
    const take = limits[tier]
    allTenders.push(...tierResults[tier].slice(0, take))
  }

  const tenders = allTenders.slice(0, 15).map(parseTender)

  return NextResponse.json({
    tenders,
    queriesRun: queryTiers.flat().length,
    cpvPrefixes,
    keywords,
  })
}
