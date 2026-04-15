import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

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
  sinceDate.setDate(sinceDate.getDate() - 180)
  const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '')

  const targetLangs = (countries || []).map((c: string) => COUNTRY_LANG[c]).filter(Boolean)
  const langNote = targetLangs.length > 0
    ? `\nIMPORTANT: Many tenders on TED are titled in the local language. Include keywords in ${targetLangs.join(', ')} as well.`
    : ''

  // ── Step 1: Ask Claude for CPV codes and keywords ──────────────────
  const prompt = `You are an EU procurement expert. Based on this company's actual products and services, suggest CPV prefixes and keywords for finding tenders they would realistically bid on.

Company: "${description}"
Sectors: ${(sectors || []).join(', ')}
Specific interests: ${(subsectors || []).join(', ')}
Target countries: ${(countries || []).join(', ')}
${langNote}

Return ONLY a JSON object:
{
  "cpv_prefixes": ["345", "355", "7124", "73400000"],
  "keywords": ["naval architecture", "vessel design", "shipbuilding"],
  "native_keywords": ["skibsdesign", "værft", "fartøj"]
}

cpv_prefixes: 6-12 CPV prefixes or full codes that match the company's actual products/services.
  Prefer 3-digit prefixes (like "345" for all ships+boats, "355" for all military equipment) when the WHOLE group is relevant.
  Use 4-digit prefixes (like "3452" boats only) when only a sub-group is relevant.
  Use full 8-digit codes (like "73400000" R&D for aviation/maritime) for very specific single categories.
  AVOID 2-digit prefixes — "34" covers all transport (ships + cars + aircraft), too broad.
  Only include prefixes for services/products the company would actually bid on — NOT adjacent industries with superficial overlap.
keywords: 5-8 English keywords that would appear in tender TITLES. Prefer specific service names over generic industry terms.
native_keywords: 3-6 specific keywords in the local language(s) of the target countries that would appear in tender titles on TED.`

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
      cpvPrefixes = parsed.cpv_prefixes || parsed.cpv_2digit || []
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
    const cpvFilter = cpvPrefixes.slice(0, 10).map(c => `classification-cpv=${c}*`).join(' OR ')
    if (tedCountries.length > 0 && tedCountries.length <= 5) {
      const countryFilter = tedCountries.map((c: string) => `organisation-country-buyer=${c}`).join(' OR ')
      queries.push(`PD>=${dateStr} AND (${cpvFilter}) AND (${countryFilter})`)
    }
    queries.push(`PD>=${dateStr} AND (${cpvFilter})`)
  }

  // Keyword-based queries
  if (keywords.length > 0) {
    const kwFilter = keywords.slice(0, 8).map(k => `FT~"${k}"`).join(' OR ')
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

  // ── Step 4: Pre-filter — CPV match OR strong title match passes ─────
  // TED titles are often in local language (Danish, Dutch, French), so an
  // English keyword won't always appear in the title even for genuinely
  // relevant tenders. CPV codes are the authoritative topic signal on TED,
  // so a CPV-prefix match alone is enough to advance to Stage 2 (where
  // Claude's strict rerank is the real quality gate). A description-only
  // keyword hit is too weak to pass alone.
  const kwLower = keywords.map(k => k.toLowerCase())
  const tedCountrySet = new Set(
    (countries || []).map((c: string) => COUNTRY_MAP[c] || c)
  )

  const scored = candidates.map(t => {
    const titleLower = t.title.toLowerCase()
    const descLower = (t.description || '').toLowerCase()

    // CPV prefix match (tender CPV starts with one of our prefixes)
    const cpvMatch = t.cpvCodes.some(c => cpvPrefixes.some(p => c.startsWith(p)))
    const titleMatch = kwLower.some(kw => titleLower.includes(kw))
    const descMatch = !titleMatch && kwLower.some(kw => descLower.includes(kw))

    let score = 0
    if (cpvMatch) score += 20
    if (titleMatch) score += 15
    else if (descMatch) score += 8

    // Country boost as a weak tiebreaker
    if (score > 0 && t.buyerCountry && tedCountrySet.has(t.buyerCountry)) {
      score += 5
    }

    return { tender: t, stage1: score }
  })

  // Pass anything with a CPV match (20) or title match (15). Description-
  // only hits (8) are too weak. Stage 2 Claude rerank is the quality gate.
  const stage1Pass = scored
    .filter(s => s.stage1 >= 15)
    .sort((a, b) => b.stage1 - a.stage1)
    .slice(0, 50)

  // ── Step 5: Claude re-rank — strict relevance check ─────────────────
  // Require score >= 7 (high confidence) and at least 3 strong matches.
  // If fewer pass, return noMatches so the wizard can prompt the user to
  // refine their description rather than showing weak examples.
  const MIN_SCORE = 7
  const MIN_GOOD_MATCHES = 3

  if (stage1Pass.length > 0) {
    try {
      const filterPrompt = `You are evaluating which public tenders are relevant for a specific company.

THE COMPANY'S OWN WORDS (this is the SOURCE OF TRUTH — match what they actually do):
"${description}"

Declared sectors: ${(sectors || []).join(', ') || '(none)'}
Target countries: ${(countries || []).join(', ') || '(none)'}

Be VERY STRICT. The tender's actual subject matter must match what the company does or sells — not merely share an industry keyword.

RULES:
- A naval architecture / ship-design firm wants VESSEL DESIGN, NAVAL ARCHITECTURE, MARINE ENGINEERING CONSULTANCY tenders. They do NOT want: marine equipment supply, oceanography research, port dredging, crew recruitment, or generic "maritime" procurement.
- A software company wants SOFTWARE DEVELOPMENT or IT SERVICES tenders. They do NOT want: office furniture, cabling, generic "digital" projects unrelated to software.
- A construction contractor wants BUILDING or INFRASTRUCTURE WORK tenders. They do NOT want: construction materials supply, surveying, or demolition-only.
- Shared industry ≠ relevant. A weak CPV overlap alone is NOT a match. A shared keyword alone is NOT a match. The tender must be something this specific company could realistically bid on and deliver.

Score 0-10 where:
- 9-10: bulls-eye — clearly in the company's core service offering
- 7-8: adjacent but plausible — still a realistic bid
- 5-6: topic overlap but not what the company does → REJECT, do NOT include
- 0-4: unrelated → REJECT

CANDIDATES (numbered)
${stage1Pass.map((s, i) => `[${i}] "${s.tender.title}"
   Buyer: ${s.tender.buyerName || '?'}${s.tender.buyerCountry ? ` (${s.tender.buyerCountry})` : ''}
   CPV: ${s.tender.cpvCodes.slice(0, 6).join(', ') || 'none'}
   ${s.tender.description ? s.tender.description.slice(0, 220) : ''}`).join('\n\n')}

Return ONLY a JSON array of tenders scoring ${MIN_SCORE} or higher, ordered by score descending. Maximum 12 entries. It is BETTER to return an empty array than to include weak matches.
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
          .filter(s => typeof s.i === 'number' && s.score >= MIN_SCORE && s.i >= 0 && s.i < stage1Pass.length)
          .map(s => ({
            ...stage1Pass[s.i].tender,
            relevanceScore: s.score,
            relevanceReason: s.why || null,
          }))

        if (filtered.length >= MIN_GOOD_MATCHES) {
          return NextResponse.json({
            tenders: filtered,
            queriesRun: queries.length,
            cpvPrefixes,
            keywords,
            filteredFrom: candidates.length,
          })
        }

        // Too few strong matches — tell the wizard so it can prompt the
        // user to refine their description instead of showing weak ones.
        return NextResponse.json({
          tenders: filtered,
          noMatches: true,
          queriesRun: queries.length,
          cpvPrefixes,
          keywords,
          filteredFrom: candidates.length,
        })
      }
    } catch (e) {
      console.warn('AI relevance filter failed:', e)
    }
  }

  // Nothing passed Stage 1 (or Stage 2 failed entirely) — signal the
  // wizard so it can ask the user to refine their description.
  return NextResponse.json({
    tenders: [],
    noMatches: true,
    queriesRun: queries.length,
    cpvPrefixes,
    keywords,
    filteredFrom: candidates.length,
  })
}
