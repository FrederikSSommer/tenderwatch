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

  // Check subscription limits
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .single()

  const plan = subscription?.plan ?? 'free'
  if (plan === 'free') {
    return NextResponse.json({ error: 'Upgrade to Starter to use AI summaries' }, { status: 403 })
  }

  if (plan === 'starter') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count } = await supabase
      .from('tenders')
      .select('id', { count: 'exact', head: true })
      .not('ai_summary', 'is', null)
      .gte('ai_summary_generated_at', startOfMonth.toISOString())

    if ((count ?? 0) >= 30) {
      return NextResponse.json({ error: 'Monthly AI summary limit reached. Upgrade to Professional for unlimited.' }, { status: 403 })
    }
  }

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
