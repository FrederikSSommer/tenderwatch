import { NextRequest, NextResponse } from 'next/server'
import { matchNewTenders } from '@/lib/matching/engine'
import { sendDailyDigest } from '@/lib/notifications/email-digest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// The matching pipeline makes many multi-second Claude calls before the
// first email goes out — the platform's default function timeout kills the
// run mid-pipeline and no digest is ever sent.
export const maxDuration = 300

// Only matches scoring at least this are emailed.
const DIGEST_MIN_SCORE = 60
// How far back the email phase looks for un-notified matches. Covers the
// weekly frequency and lets matches from a failed or timed-out run go out
// on the next one instead of being lost.
const LOOKBACK_DAYS = 7
const BATCH = 500

type PendingMatch = Pick<
  Database['public']['Tables']['matches']['Row'],
  'id' | 'tender_id' | 'profile_id' | 'user_id' | 'relevance_score' | 'ai_reason'
>

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

  // Phase 1: score new tenders. A failure here must not block the email
  // phase — matches persisted by earlier runs (or by onboarding backfill)
  // still need to be delivered.
  const since = new Date()
  since.setDate(since.getDate() - 1)
  let newMatches = 0
  let matchError: string | null = null
  try {
    const matches = await matchNewTenders(since, { supabase })
    newMatches = matches.length
  } catch (err) {
    matchError = err instanceof Error ? err.message : String(err)
    console.error('Matching failed, continuing to email phase:', err)
  }

  try {
    // Phase 2: email every un-notified match above the threshold, regardless
    // of which run created it. The matching cache skips already-scored pairs,
    // so the in-memory result above misses matches created by the onboarding
    // backfill, the hourly alert, or a previous run whose email step failed.
    const lookback = new Date()
    lookback.setDate(lookback.getDate() - LOOKBACK_DAYS)

    const pending: PendingMatch[] = []
    let offset = 0
    let fetchMore = true
    while (fetchMore) {
      const { data, error } = await supabase
        .from('matches')
        .select('id, tender_id, profile_id, user_id, relevance_score, ai_reason')
        .eq('notified', false)
        .eq('dismissed', false)
        .gte('relevance_score', DIGEST_MIN_SCORE)
        .gte('created_at', lookback.toISOString())
        .order('id')
        .range(offset, offset + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      pending.push(...data)
      offset += data.length
      fetchMore = data.length === 1000
    }

    const byUser = new Map<string, PendingMatch[]>()
    for (const m of pending) {
      const list = byUser.get(m.user_id) || []
      list.push(m)
      byUser.set(m.user_id, list)
    }

    let emailsSent = 0
    let emailsFailed = 0
    const isMonday = new Date().getUTCDay() === 1

    for (const [userId, userMatches] of byUser) {
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

      // The same tender can match several of the user's profiles — email it
      // once, at its best score.
      const byTender = new Map<string, PendingMatch>()
      for (const m of userMatches) {
        const current = byTender.get(m.tender_id)
        if (!current || m.relevance_score > current.relevance_score) {
          byTender.set(m.tender_id, m)
        }
      }

      const tenderIds = [...byTender.keys()]
      const tenders: Database['public']['Tables']['tenders']['Row'][] = []
      for (let i = 0; i < tenderIds.length; i += BATCH) {
        const { data } = await supabase
          .from('tenders')
          .select('*')
          .in('id', tenderIds.slice(i, i + BATCH))
        if (data) tenders.push(...data)
      }
      const tenderById = new Map(tenders.map(t => [t.id, t]))

      const digestTenders = [...byTender.values()]
        .flatMap(m => {
          const tender = tenderById.get(m.tender_id)
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
        })
        .sort((a, b) => b.relevance_score - a.relevance_score)

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

        // Mark every pending match for the emailed tenders as notified,
        // including lower-scored duplicates on the user's other profiles.
        const notifiedIds = userMatches
          .filter(m => tenderById.has(m.tender_id))
          .map(m => m.id)
        for (let i = 0; i < notifiedIds.length; i += BATCH) {
          await supabase
            .from('matches')
            .update({ notified: true, notified_at: new Date().toISOString() })
            .in('id', notifiedIds.slice(i, i + BATCH))
        }
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

    return NextResponse.json({
      success: true,
      newMatches,
      matchError,
      pendingMatches: pending.length,
      emailsSent,
      emailsFailed,
    })
  } catch (error) {
    console.error('Match and notify error:', error)
    return NextResponse.json({ error: 'Match and notify failed' }, { status: 500 })
  }
}
