import { NextRequest, NextResponse } from 'next/server'

const COUNTRY_MAP: Record<string, string> = {
  DK: 'DNK', NO: 'NOR', SE: 'SWE', DE: 'DEU', NL: 'NLD',
  FI: 'FIN', FR: 'FRA', UK: 'GBR', PL: 'POL', ES: 'ESP',
  IT: 'ITA', BE: 'BEL',
}

export async function POST(request: NextRequest) {
  const { searchTerm, country } = await request.json()
  if (!searchTerm) return NextResponse.json({ count: 0 })

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 90)
  const dateStr = sinceDate.toISOString().split('T')[0].replace(/-/g, '')

  const tedCountry = COUNTRY_MAP[country] || country
  let query = `PD>=${dateStr} AND FT~"${searchTerm}"`
  if (tedCountry) {
    query += ` AND organisation-country-buyer=${tedCountry}`
  }

  try {
    const res = await fetch('https://api.ted.europa.eu/v3/notices/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        fields: ['publication-number'],
        limit: 1,
        page: 1,
        scope: 2,
      }),
    })
    const data = await res.json()
    return NextResponse.json({ count: data.totalNoticeCount || 0 })
  } catch {
    return NextResponse.json({ count: 0 })
  }
}
