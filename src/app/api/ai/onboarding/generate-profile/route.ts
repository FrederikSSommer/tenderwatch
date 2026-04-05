import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    description,
    companyCountry,
    sectors,
    subsectors,
    selectedCountries,
    valueRange,
    likedTenders,
    dislikedTenders,
  } = await request.json()

  const likedSection = (likedTenders || []).length > 0
    ? `LIKED tenders (they want MORE like these):\n${likedTenders.map((t: { title: string; cpvCodes: string[]; buyerCountry: string | null; estimatedValue: number | null; description: string | null }) =>
        `- "${t.title}" [CPV: ${t.cpvCodes?.join(',')}] [Country: ${t.buyerCountry}] [Value: ${t.estimatedValue}]\n  ${t.description?.slice(0, 150) || ''}`
      ).join('\n')}`
    : 'No specific tenders were liked.'

  const dislikedSection = (dislikedTenders || []).length > 0
    ? `DISLIKED tenders (they do NOT want these):\n${dislikedTenders.map((t: { title: string; cpvCodes: string[] }) =>
        `- "${t.title}" [CPV: ${t.cpvCodes?.join(',')}]`
      ).join('\n')}`
    : 'No tenders were disliked.'

  const prompt = `You are an expert in EU public procurement (TED/CPV system). Analyze this company's preferences and generate a monitoring profile.

Company: "${description}" (based in ${companyCountry || 'EU'})
Interested sectors: ${(sectors || []).join(', ')}
Specific interests: ${(subsectors || []).join(', ')}
Preferred countries: ${(selectedCountries || []).join(', ')}
Value preference: ${valueRange || 'No preference'}

${likedSection}

${dislikedSection}

Analyze what makes the liked tenders relevant and the disliked ones irrelevant. Generate a monitoring profile.

Return ONLY a JSON object:
{
  "cpv_codes": ["71300000", ...],
  "keywords": ["keyword1", ...],
  "exclude_keywords": ["keyword1", ...],
  "countries": ["DK", "NO", ...],
  "min_value_eur": null,
  "max_value_eur": null,
  "profile_name": "Short descriptive name for this profile",
  "reasoning": "One sentence explaining the profile logic"
}

Rules:
- cpv_codes: 5-15 specific 8-digit CPV codes. Favor codes from liked tenders.
- keywords: 5-10 English search terms that would appear in relevant tender titles/descriptions
- exclude_keywords: 3-5 terms to filter out irrelevant tenders (from disliked patterns)
- countries: ISO 2-letter codes (DK, NO, SE, DE, etc.)
- Value range: only set if the user expressed a preference or if liked tenders cluster in a range`

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const profile = jsonMatch ? JSON.parse(jsonMatch[0]) : null

    if (!profile) {
      return NextResponse.json({ error: 'Failed to generate profile' }, { status: 500 })
    }

    return NextResponse.json({ profile })
  } catch (error) {
    console.error('Profile generation error:', error)
    return NextResponse.json({ error: 'Failed to generate profile' }, { status: 500 })
  }
}
