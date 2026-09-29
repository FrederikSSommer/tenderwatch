import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { rescoreFallbackMatches } from '@/lib/matching/rescore'

// Re-scores up to 240 matches through Claude (8 batches) per invocation.
export const maxDuration = 300

/**
 * Re-runs matches that were saved by the old AI-failure fallback (never
 * scored by Claude) through the real rerank, keeping only confirmed ones.
 * Scheduled daily before match-and-notify; a no-op once none remain. Can
 * also be triggered manually (same CRON_SECRET bearer) until `remaining`
 * reaches 0.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const stats = await rescoreFallbackMatches(supabase)
    return NextResponse.json({ success: true, ...stats })
  } catch (err) {
    console.error('[rescore-fallback] failed:', err)
    return NextResponse.json({ error: 'Rescore failed' }, { status: 500 })
  }
}
