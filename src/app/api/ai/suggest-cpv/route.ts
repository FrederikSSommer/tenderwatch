import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { description } = await request.json()
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  try {
    const message = await getAnthropicClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Based on this business description, suggest the most relevant CPV (Common Procurement Vocabulary) codes for monitoring EU public procurement tenders.

Business description: "${description}"

Return ONLY a JSON array of CPV code strings (8-digit format, e.g. "71300000"). Include 5-10 most relevant codes, ordered by relevance. No explanations, just the JSON array.

Example response: ["71300000", "34500000", "71327000"]`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') {
      throw new Error('Unexpected response format')
    }

    const codes = JSON.parse(content.text)
    return NextResponse.json({ codes })
  } catch (error) {
    console.error('CPV suggestion error:', error)
    return NextResponse.json({ error: 'Failed to suggest CPV codes' }, { status: 500 })
  }
}
