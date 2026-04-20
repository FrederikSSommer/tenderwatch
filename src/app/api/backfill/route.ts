import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { ingestRecentTenders } from '@/lib/ted/ingest'
import { ingestRecentHilmaNotices } from '@/lib/hilma/ingest'
import { matchNewTenders } from '@/lib/matching/engine'
import { scoreAndRerank } from '@/lib/matching/core'

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MAX_DAYS = 90

/**
 * Manual backfill — run on demand from the dashboard.
 *
 * Two modes:
 *
 * TARGETED (profileId provided — used by the onboarding wizard):
 *   Skips the broad TED ingest. Queries the `tenders` table for CPV overlap
 *   with the named profile's CPV codes, then runs scoreAndRerank. Fast and
 *   guaranteed to use the final saved profile CPVs.
 *
 * BROAD (no profileId — used by the manual BackfillButton):
 *   1. Broad TED ingestion into the shared `tenders` table
 *   2. Matching engine across all user profiles
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const days = Math.min(Math.max(Number(body.days) || 7, 1), MAX_DAYS)
  const profileId: string | undefined = body.profileId
  const force: boolean = body.force === true
  const noticeId: string | undefined = typeof body.noticeId === 'string' ? body.noticeId.trim() : undefined

  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]

  const serviceClient = getServiceClient()

  // ── NOTICE MODE ───────────────────────────────────────────────────────────
  // Fetch a single TED notice by its publication number (e.g. "267700-2026"),
  // ingest it, then run matching against all the user's active profiles.
  if (noticeId) {
    const { data: profiles } = await serviceClient
      .from('monitoring_profiles')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ error: 'No active profiles' }, { status: 400 })
    }

    const { tedClient } = await import('@/lib/ted/client')
    const { parseTEDNotice } = await import('@/lib/ted/parser')

    const response = await tedClient.search(`ND=${noticeId}`, 1, 1)
    const raw = response.notices?.[0]
    if (!raw) {
      return NextResponse.json({ error: `Notice ${noticeId} not found on TED` }, { status: 404 })
    }

    const parsed = parseTEDNotice(raw)
    if (!parsed) {
      return NextResponse.json({ error: 'Failed to parse notice' }, { status: 500 })
    }

    await serviceClient.from('tenders').upsert(
      [{
        source: parsed.source as 'ted',
        external_id: parsed.external_id,
        title: parsed.title,
        description: parsed.description,
        buyer_name: parsed.buyer_name,
        buyer_country: parsed.buyer_country,
        cpv_codes: parsed.cpv_codes,
        procedure_type: parsed.procedure_type,
        tender_type: parsed.tender_type,
        estimated_value_eur: parsed.estimated_value_eur,
        currency: parsed.currency,
        submission_deadline: parsed.submission_deadline,
        publication_date: parsed.publication_date,
        document_url: parsed.document_url,
        ted_url: parsed.ted_url,
        language: parsed.language,
        raw_data: parsed.raw_data,
      }],
      { onConflict: 'source,external_id' }
    )

    const { data: tenderRow } = await serviceClient
      .from('tenders')
      .select('id, title, description, buyer_name, buyer_country, cpv_codes, estimated_value_eur')
      .eq('external_id', parsed.external_id)
      .single()

    if (!tenderRow) {
      return NextResponse.json({ error: 'Ingest failed' }, { status: 500 })
    }

    let matched = 0
    for (const profile of profiles) {
      const results = await scoreAndRerank(
        {
          id: profile.id,
          name: profile.name,
          description: profile.description ?? null,
          keywords: profile.keywords || [],
          cpv_codes: profile.cpv_codes || [],
          exclude_keywords: profile.exclude_keywords || [],
          countries: profile.countries || [],
          min_value_eur: profile.min_value_eur,
          max_value_eur: profile.max_value_eur,
        },
        [{
          id: tenderRow.id,
          title: tenderRow.title,
          description: tenderRow.description,
          buyer_name: tenderRow.buyer_name,
          buyer_country: tenderRow.buyer_country,
          cpv_codes: tenderRow.cpv_codes || [],
          estimated_value_eur: tenderRow.estimated_value_eur,
        }],
        { stage1Threshold: 1, aiScoreThreshold: 5 }
      )

      if (results.length > 0) {
        await serviceClient.from('matches').upsert(
          results.map(r => ({
            tender_id: r.tender.id,
            profile_id: profile.id,
            user_id: user.id,
            relevance_score: r.blended_score,
            matched_cpv: r.matched_cpv,
            matched_keywords: r.matched_keywords,
            ai_reason: r.ai_reason,
          })),
          { onConflict: 'tender_id,profile_id' }
        )
        matched += results.length
      }
    }

    return NextResponse.json({
      success: true,
      ingested: 1,
      matched,
      notice: { id: noticeId, title: parsed.title, cpv_codes: parsed.cpv_codes },
    })
  }

  // ── TARGETED MODE ─────────────────────────────────────────────────────────
  // When a specific profileId is passed, skip broad TED ingest entirely.
  // Instead, query the tenders table for CPV overlap with the profile and run
  // scoreAndRerank directly. Much faster and uses the final profile CPVs.
  if (profileId) {
    const { data: profile } = await serviceClient
      .from('monitoring_profiles')
      .select('*')
      .eq('id', profileId)
      .eq('user_id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const cpvs = profile.cpv_codes || []
    if (cpvs.length === 0) {
      return NextResponse.json({ success: true, ingested: 0, matched: 0, days })
    }

    const { data: tenderRows } = await serviceClient
      .from('tenders')
      .select('id, title, description, buyer_name, buyer_country, cpv_codes, estimated_value_eur')
      .gte('publication_date', sinceStr)
      .overlaps('cpv_codes', cpvs)
      .limit(500)

    if (!tenderRows || tenderRows.length === 0) {
      return NextResponse.json({ success: true, ingested: 0, matched: 0, days })
    }

    const scored = await scoreAndRerank(
      {
        id: profile.id,
        name: profile.name,
        description: profile.description ?? null,
        keywords: profile.keywords || [],
        cpv_codes: cpvs,
        exclude_keywords: profile.exclude_keywords || [],
        countries: profile.countries || [],
        min_value_eur: profile.min_value_eur,
        max_value_eur: profile.max_value_eur,
      },
      tenderRows.map(t => ({
        id: t.id,
        title: t.title,
        description: t.description,
        buyer_name: t.buyer_name,
        buyer_country: t.buyer_country,
        cpv_codes: t.cpv_codes || [],
        estimated_value_eur: t.estimated_value_eur,
      })),
      {
        followedTitles: [],
        dismissedTitles: [],
        stage1Threshold: 5,
        stage1Cap: 120,
        aiBatchSize: 30,
        // Only write strong matches (ai_score >= 7) for the initial feed
        // population. The daily cron uses 5+ for ongoing discovery, but on
        // day 1 we want to avoid a feed full of marginal 5-6 tenders.
        aiScoreThreshold: 7,
      }
    )

    let matched = 0
    if (scored.length > 0) {
      const { error } = await serviceClient.from('matches').upsert(
        scored.map(m => ({
          tender_id: m.tender.id,
          profile_id: profile.id,
          user_id: user.id,
          relevance_score: m.blended_score,
          matched_cpv: m.matched_cpv,
          matched_keywords: m.matched_keywords,
          ai_reason: m.ai_reason,
        })),
        { onConflict: 'tender_id,profile_id' }
      )
      if (!error) matched = scored.length
    }

    return NextResponse.json({ success: true, ingested: 0, matched, days })
  }

  // ── BROAD MODE ────────────────────────────────────────────────────────────

  // Bail early if the user has no profile to score against
  const { data: profiles } = await serviceClient
    .from('monitoring_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('active', true)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({
      success: false,
      ingested: 0,
      matched: 0,
      days,
      errors: ['No active profiles. Create a monitoring profile first.'],
    })
  }

  // Check if we already have tenders for this period before hitting TED
  const { count } = await serviceClient
    .from('tenders')
    .select('id', { count: 'exact', head: true })
    .gte('publication_date', sinceStr)

  let ingest = { ingested: 0, pages: 0, errors: [] as string[] }
  if (force || (count ?? 0) < 50) {
    const [ted, hilma] = await Promise.all([
      ingestRecentTenders(serviceClient, since, { maxPages: 30 }),
      ingestRecentHilmaNotices(serviceClient, since, { maxPages: 20 }),
    ])
    ingest = {
      ingested: ted.ingested + (hilma.skipped ? 0 : hilma.ingested),
      pages: ted.pages,
      errors: [...ted.errors, ...(hilma.skipped ? [] : hilma.errors)],
    }
  }

  // Score all user profiles against the shared pool
  let matched = 0
  try {
    const matches = await matchNewTenders(since, {
      userId: user.id,
      supabase: serviceClient,
    })
    matched = matches.length
  } catch (err) {
    ingest.errors.push(`Matching: ${err instanceof Error ? err.message : String(err)}`)
  }

  return NextResponse.json({
    success: ingest.errors.length === 0 || ingest.ingested > 0 || matched > 0,
    ingested: ingest.ingested,
    matched,
    days,
    pages: ingest.pages,
    errors: ingest.errors.length > 0 ? ingest.errors : undefined,
  })
}
