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

  try {
    const matches = await matchNewTenders(since)

    const supabase = getServiceClient()
    const userMatches = new Map<string, typeof matches>()
    for (const match of matches) {
      const existing = userMatches.get(match.user_id) || []
      existing.push(match)
      userMatches.set(match.user_id, existing)
    }

    let emailsSent = 0
    for (const [userId, userMatchList] of userMatches) {
      const { data: { user } } = await supabase.auth.admin.getUserById(userId)
      if (!user?.email) continue

      const { data: profiles } = await supabase
        .from('monitoring_profiles')
        .select('name, notify_email')
        .eq('user_id', userId)
        .eq('notify_email', true)
        .limit(1)

      if (!profiles || profiles.length === 0) continue

      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan, status')
        .eq('user_id', userId)
        .single()

      if (!sub || sub.plan === 'free' || sub.status !== 'active') continue

      const tenderIds = userMatchList.map(m => m.tender_id)
      const { data: tenders } = await supabase
        .from('tenders')
        .select('*')
        .in('id', tenderIds)

      if (!tenders) continue

      const digestTenders = userMatchList.map(m => {
        const tender = tenders.find(t => t.id === m.tender_id)!
        return {
          id: tender.id,
          title: tender.title,
          buyer_name: tender.buyer_name,
          buyer_country: tender.buyer_country,
          estimated_value_eur: tender.estimated_value_eur,
          submission_deadline: tender.submission_deadline,
          relevance_score: m.relevance_score,
          cpv_codes: tender.cpv_codes,
        }
      }).sort((a, b) => b.relevance_score - a.relevance_score)

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
        })

        await supabase
          .from('matches')
          .update({ notified: true, notified_at: new Date().toISOString() })
          .in('tender_id', tenderIds)
          .eq('user_id', userId)
      } catch (err) {
        console.error(`Failed to send digest to ${user.email}:`, err)
      }
    }

    return NextResponse.json({ success: true, matches: matches.length, emailsSent })
  } catch (error) {
    console.error('Match and notify error:', error)
    return NextResponse.json({ error: 'Match and notify failed' }, { status: 500 })
  }
}
