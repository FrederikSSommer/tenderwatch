import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { ingestRecentTenders } from '@/lib/ted/ingest'
import { matchNewTenders } from '@/lib/matching/engine'
import { sendHighMatchAlert, AlertTender } from '@/lib/notifications/alert-email'

const ALERT_THRESHOLD = 80
// Look back 2 hours to absorb TED API indexing lag
const LOOKBACK_HOURS = 2

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

  const supabase = getServiceClient()
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000)

  // Ingest recent tenders (small window — usually a handful per hour)
  await ingestRecentTenders(supabase, since, { maxPages: 5 })

  // Run matching pipeline on the fresh window
  const newMatches = await matchNewTenders(since, { supabase })

  // Filter: high score only, not yet alerted
  const highScoreMatches = newMatches.filter(m => m.relevance_score >= ALERT_THRESHOLD)
  if (highScoreMatches.length === 0) {
    return NextResponse.json({ success: true, alerts: 0 })
  }

  // Check which of these have already triggered an alert (alerted_at IS NOT NULL)
  const matchPairs = highScoreMatches.map(m => `${m.profile_id}::${m.tender_id}`)
  const { data: alreadyAlerted } = await supabase
    .from('matches')
    .select('profile_id, tender_id')
    .in('tender_id', highScoreMatches.map(m => m.tender_id))
    .in('profile_id', highScoreMatches.map(m => m.profile_id))
    .not('alerted_at', 'is', null) as { data: { profile_id: string; tender_id: string }[] | null }

  const alertedSet = new Set((alreadyAlerted || []).map(r => `${r.profile_id}::${r.tender_id}`))
  const toAlert = highScoreMatches.filter(m => !alertedSet.has(`${m.profile_id}::${m.tender_id}`))

  if (toAlert.length === 0) {
    return NextResponse.json({ success: true, alerts: 0 })
  }

  // Fetch tender details
  const tenderIds = [...new Set(toAlert.map(m => m.tender_id))]
  const { data: tenders } = await supabase
    .from('tenders')
    .select('id, title, buyer_name, buyer_country, estimated_value_eur, submission_deadline, cpv_codes')
    .in('id', tenderIds)

  if (!tenders || tenders.length === 0) {
    return NextResponse.json({ success: true, alerts: 0 })
  }

  // Fetch profile names for display in email
  const profileIds = [...new Set(toAlert.map(m => m.profile_id))]
  const { data: profiles } = await supabase
    .from('monitoring_profiles')
    .select('id, name')
    .in('id', profileIds)
  const profileMap = new Map((profiles || []).map(p => [p.id, p.name]))

  // Group by user
  const byUser = new Map<string, typeof toAlert>()
  for (const m of toAlert) {
    const list = byUser.get(m.user_id) || []
    list.push(m)
    byUser.set(m.user_id, list)
  }

  let emailsSent = 0
  const nowIso = new Date().toISOString()

  for (const [userId, userMatches] of byUser) {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    if (!user?.email) continue

    // Respect email_frequency: don't alert users who have opted out entirely
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('email_frequency')
      .eq('user_id', userId)
      .single()
    if (sub?.email_frequency === 'off') continue

    const alertTenders: AlertTender[] = userMatches.flatMap(m => {
      const tender = tenders.find(t => t.id === m.tender_id)
      if (!tender) return []
      return [{
        id: tender.id,
        title: tender.title,
        buyer_name: tender.buyer_name,
        buyer_country: tender.buyer_country,
        estimated_value_eur: tender.estimated_value_eur,
        submission_deadline: tender.submission_deadline,
        cpv_codes: tender.cpv_codes || [],
        relevance_score: m.relevance_score,
        ai_reason: m.ai_reason,
        profile_name: profileMap.get(m.profile_id) || 'your profile',
      }]
    }).sort((a, b) => b.relevance_score - a.relevance_score)

    if (alertTenders.length === 0) continue

    try {
      await sendHighMatchAlert({
        to: user.email,
        userName: user.email.split('@')[0],
        tenders: alertTenders,
      })
      emailsSent++

      // Mark as alerted so subsequent hourly runs don't re-send
      await supabase
        .from('matches')
        .update({ alerted_at: nowIso } as never)
        .in('tender_id', userMatches.map(m => m.tender_id))
        .eq('user_id', userId)
    } catch (err) {
      console.error(`Failed to send alert to ${user.email}:`, err)
    }
  }

  return NextResponse.json({ success: true, alerts: toAlert.length, emailsSent })
}
