import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { ingestRecentTenders } from '@/lib/ted/ingest'
import { matchNewTenders } from '@/lib/matching/engine'

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
 * Two stages, both reusing the shared infrastructure:
 *  1. Broad TED ingestion into the shared `tenders` table (same path the
 *     daily cron uses — no per-user filtering)
 *  2. Matching engine (Stage-1 keyword/CPV scoring + Stage-2 Claude rerank,
 *     scoped to this user's profiles, with cache so we never re-score the
 *     same pair twice)
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const days = Math.min(Math.max(Number(body.days) || 7, 1), MAX_DAYS)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const serviceClient = getServiceClient()

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

  // Stage 1: broad TED ingestion into the shared tenders table
  const ingest = await ingestRecentTenders(serviceClient, since, { maxPages: 30 })

  // Stage 2: score this user's profiles against the shared pool
  // (uses Stage-1 keyword/CPV filter + Stage-2 Claude rerank, with cache)
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
