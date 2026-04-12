import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { calculateRelevance } from '@/lib/ai/relevance-score'

function getAI() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

const COUNTRY_LANG: Record<string, string> = {
  DK: 'Danish', NO: 'Norwegian', SE: 'Swedish', DE: 'German',
  NL: 'Dutch', FI: 'Finnish', FR: 'French', PL: 'Polish',
  ES: 'Spanish', IT: 'Italian', BE: 'French/Dutch',
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

// ─── Main handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { description, sectors, subsectors, countries, buyers } = await request.json()

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 60)
  const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '')

  const targetLangs = (countries || []).map((c: string) => COUNTRY_LANG[c]).filter(Boolean)
  const langNote = targetLangs.length > 0
    ? `\nIMPORTANT: Many tenders on TED are titled in the local language. Include keywords in ${targetLangs.join(', ')} as well.`
    : ''

  // ── Step 1: Ask Claude for CPV codes and keywords ──────────────────
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
    const message = await getAI().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      cpvPrefixes = parsed.cpv_2digit || []
      keywords = [...(parsed.keywords || []), ...(parsed.native_keywords || [])]
    }
  } catch {
    keywords = (sectors || []).slice(0, 3)
  }

  // ── Step 2: Broad TED fetch ────────────────────────────────────────
  const tedCountries = (countries || [])
    .map((c: string) => COUNTRY_MAP[c] || c)
    .filter(Boolean)

  const queries: string[] = []

  // CPV-based queries
  if (cpvPrefixes.length > 0) {
    const cpvFilter = cpvPrefixes.slice(0, 4).map(c => `classification-cpv=${c}*`).join(' OR ')
    if (tedCountries.length > 0 && tedCountries.length <= 5) {
      const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queries.push(`PD>=${dateStr} AND (${cpvFilter}) AND (${countryFilter})`)
    }
    queries.push(`PD>=${dateStr} AND (${cpvFilter})`)
  }

  // Keyword-based queries
  if (keywords.length > 0) {
    const kwFilter = keywords.slice(0, 6).map(k => `FT~"${k}"`).join(' OR ')
    if (tedCountries.length > 0) {
      const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queries.push(`PD>=${dateStr} AND (${kwFilter}) AND (${countryFilter})`)
    }
    queries.push(`PD>=${dateStr} AND (${kwFilter})`)
  }

  // Buyer-specific queries
  if (buyers && buyers.length > 0) {
    for (const buyer of buyers.slice(0, 4)) {
      const bf = getBuyerFilter(buyer as Record<string, unknown>)
      if (!bf) continue
      const buyerCountry = COUNTRY_MAP[(buyer as Record<string, unknown>).country as string] || (buyer as Record<string, unknown>).country
      if (buyerCountry) {
        queries.push(`PD>=${dateStr} AND ${bf} AND organisation-country-buyer=${buyerCountry}`)
      } else {
        queries.push(`PD>=${dateStr} AND ${bf}`)
      }
    }
  }

  // Fetch and deduplicate
  const seenIds = new Set<string>()
  const allNotices: Record<string, unknown>[] = []
  for (const query of queries) {
    const notices = await searchTED(query, 20)
    for (const notice of notices) {
      const id = notice['publication-number'] as string
      if (id && !seenIds.has(id)) {
        seenIds.add(id)
        allNotices.push(notice)
      }
    }
    await new Promise(r => setTimeout(r, 200))
  }

  const candidates = allNotices.map(parseTender)

  // ── Step 3: Ingest into tenders table (so backfill can use them) ───
  const supabase = getServiceClient()
  if (candidates.length > 0) {
    const rows = candidates.map(t => ({
      source: 'ted' as const,
      external_id: t.id,
      title: t.title,
      description: t.description,
      buyer_name: t.buyerName,
      buyer_country: t.buyerCountry,
      cpv_codes: t.cpvCodes,
      estimated_value_eur: t.estimatedValue,
      publication_date: t.publicationDate || new Date().toISOString().split('T')[0],
      ted_url: t.tedUrl,
      notice_type: t.noticeType,
    }))
    try {
      await supabase.from('tenders').upsert(rows, { onConflict: 'source,external_id' })
    } catch { /* best-effort — don't block wizard if DB write fails */ }
  }

  // ── Step 4: Pre-filter with keyword/CPV prefix matching ─────────────
  // Instead of calculateRelevance (which needs full 8-digit CPV codes we
  // don't have yet), do a simpler prefix + keyword check directly.
  const cpvPrefixSet = new Set(cpvPrefixes) // 2-digit prefixes like "34", "71"
  const kwLower = keywords.map(k => k.toLowerCase())

  const scored = candidates.map(t => {
    let score = 0
    const titleLower = t.title.toLowerCase()
    const descLower = (t.description || '').toLowerCase()

    // CPV prefix match (any tender CPV starting with a profile prefix)
    const cpvMatch = t.cpvCodes.some(c => cpvPrefixes.some(p => c.startsWith(p)))
    if (cpvMatch) score += 20

    // Keyword match in title (strong) or description (weaker)
    for (const kw of kwLower) {
      if (titleLower.includes(kw)) { score += 15; break }
      if (descLower.includes(kw)) { score += 8; break }
    }

    // Country match (only if topic signal exists)
    if (score > 0 && t.buyerCountry) {
      const tedCountrySet = new Set(
        (countries || []).map((c: string) => COUNTRY_MAP[c] || c)
      )
      if (tedCountrySet.has(t.buyerCountry)) score += 10
    }

    return { tender: t, stage1: score }
  })

  // Keep anything with at least a CPV or keyword match
  const stage1Pass = scored
    .filter(s => s.stage1 >= 8)
    .sort((a, b) => b.stage1 - a.stage1)
    .slice(0, 50)

  // ── Step 5: Claude re-rank (same prompt as shared engine) ──────────
  if (stage1Pass.length > 0) {
    try {
      const profileDesc =
        `Company: ${description}\n` +
        `Sectors: ${(sectors || []).join(', ')}\n` +
        `Keywords: ${keywords.slice(0, 10).join(', ')}\n` +
        `CPV prefixes: ${cpvPrefixes.join(', ')}`

      const filterPrompt = `You are evaluating which public tenders are relevant for a company.

PROFILE
${profileDesc}

Be STRICT and LITERAL. Match the actual product or service the company would buy or sell, not just shared sectors. Examples of WRONG matches:
- a shipbuilding profile with workwear, hand guns, or canteen catering tenders
- a software/IT profile with office furniture or printer toner
- a road construction profile with traffic-light bulbs
A weak buyer/CPV overlap is NOT enough — the actual subject of the tender must align with the profile.

CANDIDATES (numbered)
${stage1Pass.map((s, i) => `[${i}] "${s.tender.title}"
   Buyer: ${s.tender.buyerName || '?'}${s.tender.buyerCountry ? ` (${s.tender.buyerCountry})` : ''}
   CPV: ${s.tender.cpvCodes.slice(0, 6).join(', ') || 'none'}
   ${s.tender.description ? s.tender.description.slice(0, 220) : ''}`).join('\n\n')}

Return ONLY a JSON array, ordered by score descending. Include only tenders scoring 5 or higher (0-10). Maximum 12 entries.
Format: [{"i": 0, "score": 9, "why": "short reason"}, ...]`

      const msg = await getAI().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [
          { role: 'user', content: filterPrompt },
          { role: 'assistant', content: '[' },
        ],
      })

      const text = msg.content[0].type === 'text' ? '[' + msg.content[0].text : '[]'
      const m = text.match(/\[[\s\S]*?\]/)
      if (m) {
        const aiScored: { i: number; score: number; why?: string }[] = JSON.parse(m[0])
        const filtered = aiScored
          .filter(s => typeof s.i === 'number' && s.score >= 5 && s.i >= 0 && s.i < stage1Pass.length)
          .map(s => ({
            ...stage1Pass[s.i].tender,
            relevanceScore: s.score,
            relevanceReason: s.why || null,
          }))

        if (filtered.length > 0) {
          return NextResponse.json({
            tenders: filtered,
            queriesRun: queries.length,
            cpvPrefixes,
            keywords,
            filteredFrom: candidates.length,
          })
        }
      }
    } catch (e) {
      console.warn('AI relevance filter failed, falling back to Stage-1 results:', e)
    }
  }

  // Fallback: return top Stage-1 candidates unfiltered
  const fallback = stage1Pass.slice(0, 12).map(s => ({
    ...s.tender,
    relevanceScore: Math.round(s.stage1 / 10),
    relevanceReason: null,
  }))

  return NextResponse.json({
    tenders: fallback,
    queriesRun: queries.length,
    cpvPrefixes,
    keywords,
    filteredFrom: candidates.length,
  })
}
