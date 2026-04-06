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

Generate 8-12 specific public sector organizations (ministries, agencies, municipalities, EU institutions) that regularly issue tenders in these areas. Include both the official name and a short English label.

For Danish defence/military, include:
- "Forsvarsministeriets Materiel- og Indkøbsstyrelse" (DALO - Danish Defence Acquisition)
- "Forsvarets Koncernfælles Informatiktjeneste" (Danish Defence IT)

Return ONLY a JSON array:
[{"id": "unique-slug", "name": "Official organization name", "label": "Short English label", "country": "DK"}]

Focus on organizations that ACTUALLY publish on TED (EU procurement portal). Be specific — use real organization names, not generic categories.`

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
