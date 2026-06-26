import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sendDailyDigest } from '@/lib/notifications/email-digest'

/**
 * Test endpoint — sends a sample digest email to the logged-in user.
 * POST /api/test-email
 */
export async function POST() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  }

  // Use real tenders so the "View tender" links in the email resolve —
  // fabricated IDs 404 against the tender detail page's DB lookup.
  const { data: realTenders } = await supabase
    .from('tenders')
    .select('id, title, buyer_name, buyer_country, estimated_value_eur, submission_deadline, cpv_codes')
    .order('created_at', { ascending: false })
    .limit(4)

  if (!realTenders || realTenders.length === 0) {
    return NextResponse.json({
      error: 'No tenders in the database yet — ingest some tenders before sending a test email',
    }, { status: 400 })
  }

  const sampleReasons = [
    'Directly relevant — matches your profile\'s sector and CPV codes',
    'Strong overlap with your monitored keywords and buyer region',
    'Partial match — overlaps with one of your tracked CPV codes',
    'Tangentially related to your monitoring profile',
  ]

  const sampleTenders = realTenders.map((t, i) => ({
    id: t.id,
    title: t.title,
    buyer_name: t.buyer_name,
    buyer_country: t.buyer_country,
    estimated_value_eur: t.estimated_value_eur,
    submission_deadline: t.submission_deadline,
    relevance_score: 90 - i * 12,
    cpv_codes: t.cpv_codes,
    ai_reason: sampleReasons[i] ?? sampleReasons[sampleReasons.length - 1],
  }))

  try {
    await sendDailyDigest({
      to: user.email,
      userName: user.email.split('@')[0],
      profileName: 'Maritime & Naval',
      tenders: sampleTenders,
    })
    return NextResponse.json({ success: true, sentTo: user.email })
  } catch (err) {
    return NextResponse.json({
      error: 'Failed to send',
      details: err instanceof Error ? err.message : String(err),
    }, { status: 500 })
  }
}
