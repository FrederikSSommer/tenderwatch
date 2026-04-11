import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

interface KnownBuyer {
  id: string
  name: string
  label: string
  country: string
  searchTerms: string[]
}

// Curated list of major TED-publishing buyers per topic + country.
// Used to deterministically seed buyer suggestions when Claude misses them.
const KNOWN_BUYERS: Record<string, Record<string, KnownBuyer[]>> = {
  defence: {
    DK: [
      { id: 'dk-dalo', name: 'Forsvarsministeriets Materiel- og Indkøbsstyrelse', label: 'Danish Defence Acquisition (DALO)', country: 'DK', searchTerms: ['Forsvarsministeriets'] },
      { id: 'dk-fmt', name: 'Forsvarets Materieltjeneste', label: 'Danish Armed Forces Materiel Service', country: 'DK', searchTerms: ['Materieltjeneste'] },
    ],
    SE: [{ id: 'se-fmv', name: 'Försvarets Materielverk', label: 'Swedish Defence Materiel Administration (FMV)', country: 'SE', searchTerms: ['Materielverk'] }],
    NO: [{ id: 'no-fma', name: 'Forsvarsmateriell', label: 'Norwegian Defence Materiel Agency', country: 'NO', searchTerms: ['Forsvarsmateriell'] }],
    FI: [{ id: 'fi-puolustusvoimat', name: 'Puolustusvoimat', label: 'Finnish Defence Forces', country: 'FI', searchTerms: ['Puolustusvoimat'] }],
    DE: [{ id: 'de-baainbw', name: 'Bundesamt für Ausrüstung, Informationstechnik und Nutzung der Bundeswehr', label: 'BAAINBw (German Defence Procurement)', country: 'DE', searchTerms: ['BAAINBw'] }],
    NL: [{ id: 'nl-dmo', name: 'Defensie Materieel Organisatie', label: 'Dutch Defence Materiel Org', country: 'NL', searchTerms: ['Defensie Materieel'] }],
    FR: [{ id: 'fr-dga', name: 'Direction Générale de l\'Armement', label: 'French Defence Procurement (DGA)', country: 'FR', searchTerms: ['Armement'] }],
    UK: [{ id: 'uk-de-s', name: 'Defence Equipment & Support', label: 'UK Defence Equipment & Support', country: 'UK', searchTerms: ['Defence Equipment'] }],
    PL: [{ id: 'pl-iu', name: 'Inspektorat Uzbrojenia', label: 'Polish Armament Inspectorate', country: 'PL', searchTerms: ['Inspektorat Uzbrojenia'] }],
    BE: [{ id: 'be-mod', name: 'Ministerie van Landsverdediging', label: 'Belgian Ministry of Defence', country: 'BE', searchTerms: ['Landsverdediging'] }],
  },
  maritime: {
    DK: [
      { id: 'dk-soefart', name: 'Søfartsstyrelsen', label: 'Danish Maritime Authority', country: 'DK', searchTerms: ['Søfartsstyrelsen'] },
      { id: 'dk-soevaernet', name: 'Søværnet', label: 'Royal Danish Navy', country: 'DK', searchTerms: ['Søværnet'] },
    ],
    NO: [
      { id: 'no-kystverket', name: 'Kystverket', label: 'Norwegian Coastal Administration', country: 'NO', searchTerms: ['Kystverket'] },
      { id: 'no-sjofart', name: 'Sjøfartsdirektoratet', label: 'Norwegian Maritime Authority', country: 'NO', searchTerms: ['Sjøfartsdirektoratet'] },
    ],
    SE: [{ id: 'se-sjofart', name: 'Sjöfartsverket', label: 'Swedish Maritime Administration', country: 'SE', searchTerms: ['Sjöfartsverket'] }],
    FI: [{ id: 'fi-traficom', name: 'Traficom', label: 'Finnish Transport and Communications Agency', country: 'FI', searchTerms: ['Traficom'] }],
    NL: [{ id: 'nl-rijkswaterstaat', name: 'Rijkswaterstaat', label: 'Dutch Directorate-General for Public Works', country: 'NL', searchTerms: ['Rijkswaterstaat'] }],
  },
  health: {
    DK: [
      { id: 'dk-regh', name: 'Region Hovedstaden', label: 'Capital Region of Denmark', country: 'DK', searchTerms: ['Region Hovedstaden'] },
      { id: 'dk-sundhed', name: 'Sundhedsdatastyrelsen', label: 'Danish Health Data Authority', country: 'DK', searchTerms: ['Sundhedsdatastyrelsen'] },
    ],
  },
  it: {
    DK: [{ id: 'dk-digst', name: 'Digitaliseringsstyrelsen', label: 'Danish Agency for Digital Government', country: 'DK', searchTerms: ['Digitaliseringsstyrelsen'] }],
  },
  construction: {
    DK: [
      { id: 'dk-bygst', name: 'Bygningsstyrelsen', label: 'Danish Building & Property Agency', country: 'DK', searchTerms: ['Bygningsstyrelsen'] },
      { id: 'dk-vd', name: 'Vejdirektoratet', label: 'Danish Road Directorate', country: 'DK', searchTerms: ['Vejdirektoratet'] },
    ],
  },
}

const TOPIC_KEYWORDS: Record<string, string[]> = {
  defence: ['defence', 'defense', 'military', 'naval', 'navy', 'army', 'armed forces', 'weapons', 'armament', 'forsvar'],
  maritime: ['maritime', 'naval', 'ship', 'vessel', 'boat', 'shipyard', 'shipbuilding', 'marine', 'port', 'harbour', 'harbor', 'coastal', 'søfart', 'fartøj', 'værft'],
  health: ['health', 'hospital', 'medical', 'pharma', 'clinical', 'sundhed'],
  it: ['software', 'it ', 'digital', 'cloud', 'cybersecurity', 'data'],
  construction: ['construction', 'building', 'infrastructure', 'road', 'bridge', 'civil engineering'],
}

function detectTopics(description: string, sectors: string[]): string[] {
  const text = (description + ' ' + sectors.join(' ')).toLowerCase()
  const topics: string[] = []
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) topics.push(topic)
  }
  return topics
}

function seedBuyers(description: string, sectors: string[], targetCountries: string[]): KnownBuyer[] {
  const topics = detectTopics(description, sectors)
  const seeded: KnownBuyer[] = []
  for (const topic of topics) {
    const byCountry = KNOWN_BUYERS[topic]
    if (!byCountry) continue
    for (const cc of targetCountries) {
      const list = byCountry[cc]
      if (list) seeded.push(...list)
    }
  }
  return seeded
}

export async function POST(request: NextRequest) {
  const { description, country, sectors, subsectors, countries } = await request.json()
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  // Seed with known major buyers for the detected topics + target countries
  const seeded = seedBuyers(description, sectors || [], countries || [])

  const seededHint = seeded.length > 0
    ? `\nThese major buyers are already pre-selected and will be added automatically — you do NOT need to repeat them, suggest DIFFERENT complementary organizations:\n${seeded.map(b => `- ${b.name} (${b.country})`).join('\n')}`
    : ''

  const prompt = `You are an expert in EU public procurement. Based on this company's profile, suggest the most likely PUBLIC SECTOR BUYERS (contracting authorities) that would issue tenders relevant to them.

Company: "${description}"
Company country: ${country || 'EU'}
Sectors: ${(sectors || []).join(', ')}
${(subsectors || []).length > 0 ? `Specific interests: ${(subsectors || []).join(', ')}` : ''}
Target countries: ${(countries || []).join(', ')}
${seededHint}

Generate 6-10 ADDITIONAL specific public sector organizations (ministries, agencies, municipalities, EU institutions) that regularly issue tenders in these areas. Focus on organizations that actually publish on TED. Use real official names. Prioritize buyers in the target countries listed above.

For each organization include:
- id: unique slug
- name: official organization name (as it appears on TED, in the local language)
- label: short English label (3-5 words)
- country: ISO 2-letter code
- searchTerms: 1-2 distinctive words from the official name for TED full-text search. Use a single distinctive word that occurs in the org name. Avoid generic words.

Reply with ONLY a JSON array. No prose, no code fences. Start your response with [ and end with ]. Example shape:
[{"id":"dk-vd","name":"Vejdirektoratet","label":"Danish Road Directorate","country":"DK","searchTerms":["Vejdirektoratet"]}]`

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

    if (!Array.isArray(buyers)) buyers = []
    if (buyers.length === 0 && seeded.length === 0) {
      console.error('Buyer suggestion: empty/invalid JSON. Raw:', text.slice(0, 500))
      return NextResponse.json({ error: 'No buyers returned', buyers: [] }, { status: 500 })
    }

    // Merge seeded buyers first, then Claude's suggestions, deduping by name
    const seenNames = new Set<string>()
    const merged: unknown[] = []
    for (const b of seeded) {
      const key = b.name.toLowerCase().trim()
      if (!seenNames.has(key)) {
        seenNames.add(key)
        merged.push(b)
      }
    }
    for (const b of buyers) {
      const name = (b as { name?: string })?.name?.toLowerCase().trim()
      if (name && !seenNames.has(name)) {
        seenNames.add(name)
        merged.push(b)
      }
    }

    return NextResponse.json({ buyers: merged })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Buyer suggestion error:', msg)
    // Even if Claude fails, return seeded buyers so the wizard isn't blocked
    if (seeded.length > 0) {
      return NextResponse.json({ buyers: seeded })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
