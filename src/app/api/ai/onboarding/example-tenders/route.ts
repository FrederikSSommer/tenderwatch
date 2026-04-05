import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { description, sectors, subsectors, countries } = await request.json()

  // Step 1: Ask Claude to generate a TED search query
  const queryPrompt = `Convert these procurement interests into a TED API search query.

Company: "${description}"
Sectors: ${(sectors || []).join(', ')}
Specific interests: ${(subsectors || []).join(', ')}
Countries: ${(countries || []).join(', ')}

The TED search query syntax uses:
- PD>=YYYYMMDD for publication date
- classification-cpv=XXXXXXXX for CPV codes (use * for prefix, e.g. 34* for all transport)
- organisation-country-buyer=XXX for 3-letter country codes (DNK, NOR, SWE, DEU, etc.)
- FT~"keyword" for full-text search
- AND, OR for combining
- Use date from 60 days ago

Return ONLY a JSON object:
{
  "queries": ["query1", "query2"],
  "explanation": "one sentence"
}

Generate 2-3 complementary queries that together cover the interests well. Each query should be different (one CPV-based, one keyword-based, one country-specific).`

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: queryPrompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { queries: [] }
    const tedQueries: string[] = parsed.queries || []

    // Step 2: Fetch from TED
    const allTenders: Record<string, unknown>[] = []
    const seenIds = new Set<string>()

    for (const query of tedQueries.slice(0, 3)) {
      try {
        const response = await fetch(`${TED_API_BASE}/notices/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, fields: TED_FIELDS, limit: 10, page: 1, scope: 2 }),
        })

        if (!response.ok) continue

        const data = await response.json()
        for (const notice of data.notices || []) {
          const id = notice['publication-number']
          if (id && !seenIds.has(id)) {
            seenIds.add(id)
            allTenders.push(notice)
          }
        }
      } catch {
        // Skip failed queries
      }
    }

    // Step 3: Parse into simple format
    const tenders = allTenders.slice(0, 15).map(n => {
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
    })

    return NextResponse.json({
      tenders,
      queriesUsed: tedQueries.length,
    })
  } catch (error) {
    console.error('Example tenders error:', error)
    return NextResponse.json({ error: 'Failed to fetch examples' }, { status: 500 })
  }
}
