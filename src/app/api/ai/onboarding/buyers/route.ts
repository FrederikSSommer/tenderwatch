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
${(subsectors || []).length > 0 ? `Specific interests: ${(subsectors || []).join(', ')}` : ''}
Target countries: ${(countries || []).join(', ')}

Generate 8-12 specific public sector organizations (ministries, agencies, municipalities, EU institutions) that regularly issue tenders in these areas. Focus on organizations that actually publish on TED. Use real official names.

For each organization include:
- id: unique slug
- name: official organization name (as it appears on TED)
- label: short English label (3-5 words)
- country: ISO 2-letter code
- searchTerms: 1-2 distinctive words from the official name for TED full-text search. Use a single distinctive word that occurs in the org name (e.g. "Forsvarsministeriets" for the Danish Defence Acquisition Org). Avoid generic words.

Reply with ONLY a JSON array. No prose, no code fences. Start your response with [ and end with ]. Example shape:
[{"id":"dk-dalo","name":"Forsvarsministeriets Materiel- og Indkøbsstyrelse","label":"Danish Defence Acquisition","country":"DK","searchTerms":["Forsvarsministeriets"]}]`

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '[' },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    // Prefill forces continuation — prepend the [ we sent as assistant
    const text = '[' + raw

    let buyers: unknown[] = []
    try {
      buyers = JSON.parse(text)
    } catch {
      // Fallback: try to extract the largest valid JSON array
      const match = text.match(/\[[\s\S]*\]/)
      if (match) {
        try { buyers = JSON.parse(match[0]) } catch {
          // Last resort: trim trailing junk after final closing bracket
          const lastBracket = text.lastIndexOf(']')
          if (lastBracket > 0) {
            try { buyers = JSON.parse(text.slice(0, lastBracket + 1)) } catch {}
          }
        }
      }
    }

    if (!Array.isArray(buyers) || buyers.length === 0) {
      console.error('Buyer suggestion: empty/invalid JSON. Raw:', text.slice(0, 500))
      return NextResponse.json({ error: 'No buyers returned', buyers: [] }, { status: 500 })
    }

    return NextResponse.json({ buyers })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Buyer suggestion error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
