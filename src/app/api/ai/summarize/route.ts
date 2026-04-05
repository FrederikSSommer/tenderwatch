import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { summarizeTender } from '@/lib/ai/summarize'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { tenderId } = await request.json()
  if (!tenderId) {
    return NextResponse.json({ error: 'tenderId is required' }, { status: 400 })
  }

  const { data: tender } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', tenderId)
    .single()

  if (!tender) {
    return NextResponse.json({ error: 'Tender not found' }, { status: 404 })
  }

  if (tender.ai_summary) {
    return NextResponse.json({ summary: tender.ai_summary })
  }

  // TODO: Re-enable plan limits when Stripe is connected
  // For prototype: all features unlocked

  try {
    const summary = await summarizeTender({
      title: tender.title,
      buyer_name: tender.buyer_name,
      buyer_country: tender.buyer_country,
      cpv_codes: tender.cpv_codes,
      estimated_value_eur: tender.estimated_value_eur,
      submission_deadline: tender.submission_deadline,
      description: tender.description,
    })

    await supabase
      .from('tenders')
      .update({
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString(),
      })
      .eq('id', tenderId)

    return NextResponse.json({ summary })
  } catch (error) {
    console.error('AI summarization error:', error)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
