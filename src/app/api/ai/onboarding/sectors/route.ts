import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(request: NextRequest) {
  const { description, country, selectedSectors } = await request.json()
  if (!description) return NextResponse.json({ error: 'description required' }, { status: 400 })

  const isFollowUp = selectedSectors && selectedSectors.length > 0

  const prompt = isFollowUp
    ? `A company described as: "${description}" (based in ${country || 'EU'}) is interested in these procurement areas: ${selectedSectors.join(', ')}.

Generate 5-6 MORE SPECIFIC sub-categories within those areas. These should narrow down to specific types of contracts they'd bid on.

Return ONLY a JSON array: [{"id": "unique-slug", "label": "Short label (2-5 words)", "emoji": "relevant emoji"}]`
    : `You are helping a company set up EU public tender monitoring.

Company description: "${description}"
Company country: ${country || 'EU'}

Generate 6-8 industry/sector labels describing the types of public procurement tenders this company would want to monitor. Be specific and practical — think about what they'd actually bid on.

Return ONLY a JSON array: [{"id": "unique-slug", "label": "Short label (2-5 words)", "emoji": "relevant emoji"}]
Example: [{"id": "ship-design", "label": "Ship design & naval architecture", "emoji": "🚢"}, {"id": "port-infra", "label": "Port infrastructure", "emoji": "⚓"}]`

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    const sectors = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    return NextResponse.json({ sectors })
  } catch (error) {
    console.error('Sector suggestion error:', error)
    return NextResponse.json({ error: 'Failed to generate sectors' }, { status: 500 })
  }
}
