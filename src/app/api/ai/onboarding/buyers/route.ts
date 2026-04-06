import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(request: NextRequest) {
  const { description, country, sectors, subsectors, countries } = await request.json()
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  const prompt = `You are an expert in EU public procurement. Based on this company's profile, suggest the most likely PUBLIC SECTOR BUYERS (contracting authorities) that would issue tenders relevant to them.

Company: "${description}"
Company country: ${country || 'EU'}
Sectors: ${(sectors || []).join(', ')}
Specific interests: ${(subsectors || []).join(', ')}
Target countries: ${(countries || []).join(', ')}

Generate 8-12 specific public sector organizations (ministries, agencies, municipalities, EU institutions) that regularly issue tenders in these areas.

For each organization, provide:
- The official name (as it appears on TED)
- A short English label
- 1-2 distinctive search keywords from the official name that would match on TED full-text search (a single unique word from the org name works best, e.g. "Forsvarsministeriets" for DALO)

For Danish defence/military, include:
- "Forsvarsministeriets Materiel- og Indkøbsstyrelse" with search term "Forsvarsministeriets"
- "Forsvarets Koncernfælles Informatiktjeneste" with search term "Forsvarets Informatiktjeneste"

Return ONLY a JSON array:
[{"id": "unique-slug", "name": "Official organization name", "label": "Short English label", "country": "DK", "searchTerms": ["Forsvarsministeriets"]}]

Focus on organizations that ACTUALLY publish on TED (EU procurement portal). Use real organization names. The searchTerms should be distinctive words from the official name that can be used for full-text search on TED.`

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const buyers = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    return NextResponse.json({ buyers })
  } catch (error) {
    console.error('Buyer suggestion error:', error)
    return NextResponse.json({ error: 'Failed to generate buyer suggestions' }, { status: 500 })
  }
}
