import { NextRequest, NextResponse } from 'next/server'
import { matchNewTenders } from '@/lib/matching/engine'
import { sendDailyDigest } from '@/lib/notifications/email-digest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const since = new Date()
  since.setDate(since.getDate() - 1)

  const DIGEST_MIN_SCORE = 60

  try {
    // Score & persist any new tenders. We intentionally DON'T build the digest
    // from this return value: matchNewTenders skips (profile, tender) pairs it
    // has already scored on an earlier run, so on most days it returns nothing
    // even though qualifying matches exist in the DB. Driving the digest off
    // its return value meant a single already-scored day produced no email at
    // all. Instead we always read the digest from the `matches` table below.
    const matches = await matchNewTenders(since)

    const supabase = getServiceClient()

    // Find every user with an un-notified, non-dismissed match above the digest
    // threshold within the widest possible window (weekly catch-up = 7 days).
    // Per-user frequency then decides whether to send and how far to look back.
    const widestWindow = new Date()
    widestWindow.setDate(widestWindow.getDate() - 7)
    const { data: pendingRows, error: pendingErr } = await supabase
      .from('matches')
      .select('user_id')
      .eq('notified', false)
      .eq('dismissed', false)
      .gte('relevance_score', DIGEST_MIN_SCORE)
      .gte('created_at', widestWindow.toISOString())
    if (pendingErr) {
      console.error('Failed to load pending matches:', pendingErr)
      return NextResponse.json({ error: 'Match and notify failed' }, { status: 500 })
    }

    const userIds = [...new Set((pendingRows || []).map(r => r.user_id))]

    let emailsSent = 0
    let emailsFailed = 0
    const isMonday = new Date().getUTCDay() === 1

    for (const userId of userIds) {
      const { data: { user } } = await supabase.auth.admin.getUserById(userId)
      if (!user?.email) continue

      // Check global email frequency setting
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('email_frequency')
        .eq('user_id', userId)
        .single()

      const frequency = sub?.email_frequency ?? 'daily'
      if (frequency === 'off') continue
      if (frequency === 'weekly' && !isMonday) continue

      const { data: profiles } = await supabase
        .from('monitoring_profiles')
        .select('name, notify_email')
        .eq('user_id', userId)
        .eq('notify_email', true)
        .limit(1)

      if (!profiles || profiles.length === 0) continue

      // TODO: Re-enable plan check when Stripe is connected
      // const { data: sub } = await supabase
      //   .from('subscriptions')
      //   .select('plan, status')
      //   .eq('user_id', userId)
      //   .single()
      // if (!sub || sub.plan === 'free' || sub.status !== 'active') continue

      // Daily digests cover a 2-day window (so a single missed/failed run is
      // recovered the next day); weekly digests cover the past 7 days.
      const lookback = new Date()
      lookback.setDate(lookback.getDate() - (frequency === 'weekly' ? 7 : 2))
      const { data: pendingMatches } = await supabase
        .from('matches')
        .select('tender_id, relevance_score, matched_cpv, matched_keywords, ai_reason')
        .eq('user_id', userId)
        .eq('notified', false)
        .eq('dismissed', false)
        .gte('relevance_score', DIGEST_MIN_SCORE)
        .gte('created_at', lookback.toISOString())

      const finalMatchList = pendingMatches || []
      if (finalMatchList.length === 0) continue

      const tenderIds = finalMatchList.map(m => m.tender_id)
      const { data: tenders } = await supabase
        .from('tenders')
        .select('*')
        .in('id', tenderIds)

      if (!tenders) continue

      const digestTenders = finalMatchList.filter(m => m.relevance_score >= DIGEST_MIN_SCORE).flatMap(m => {
        const tender = tenders.find(t => t.id === m.tender_id)
        if (!tender) return []
        return [{
          id: tender.id,
          title: tender.title,
          buyer_name: tender.buyer_name,
          buyer_country: tender.buyer_country,
          estimated_value_eur: tender.estimated_value_eur,
          submission_deadline: tender.submission_deadline,
          relevance_score: m.relevance_score,
          cpv_codes: tender.cpv_codes,
          ai_reason: m.ai_reason,
        }]
      }).sort((a, b) => b.relevance_score - a.relevance_score)

      if (digestTenders.length === 0) continue

      try {
        await sendDailyDigest({
          to: user.email,
          userName: user.email.split('@')[0],
          profileName: profiles[0].name,
          tenders: digestTenders,
        })
        emailsSent++

        await supabase.from('notifications').insert({
          user_id: userId,
          channel: 'email' as const,
          tender_count: digestTenders.length,
          status: 'sent' as const,
        })

        // Only mark the matches actually included in the email — sub-threshold
        // matches stay un-notified so the weekly catch-up can still pick them up.
        const digestTenderIds = digestTenders.map(t => t.id)
        await supabase
          .from('matches')
          .update({ notified: true, notified_at: new Date().toISOString() })
          .in('tender_id', digestTenderIds)
          .eq('user_id', userId)
      } catch (err) {
        emailsFailed++
        console.error(`Failed to send digest to ${user.email}:`, err)
        await supabase.from('notifications').insert({
          user_id: userId,
          channel: 'email' as const,
          tender_count: digestTenders.length,
          status: 'failed' as const,
          error: err instanceof Error ? err.message : JSON.stringify(err),
        })
      }
    }

    return NextResponse.json({ success: true, matches: matches.length, emailsSent, emailsFailed })
  } catch (error) {
    console.error('Match and notify error:', error)
    return NextResponse.json({ error: 'Match and notify failed' }, { status: 500 })
  }
}
