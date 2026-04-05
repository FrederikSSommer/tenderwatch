import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { tedClient } from '@/lib/ted/client'
import { parseTEDNotice } from '@/lib/ted/parser'
import { calculateRelevance } from '@/lib/ai/relevance-score'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

function getServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const MAX_DAYS = 90
const MATCH_THRESHOLD = 20

export async function POST(request: NextRequest) {
  // Auth check — must be logged in
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const days = Math.min(Math.max(Number(body.days) || 7, 1), MAX_DAYS)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const serviceClient = getServiceClient()

  // Step 1: Ingest tenders from TED for the period
  let totalIngested = 0
  let page = 1
  let hasMore = true

  try {
    while (hasMore) {
      const response = await tedClient.fetchRecentContractNotices(since, page)

      if (!response.results || response.results.length === 0) {
        hasMore = false
        break
      }

      const parsed = response.results.map(parseTEDNotice)

      const { error } = await serviceClient
        .from('tenders')
        .upsert(
          parsed.map(t => ({
            source: t.source as 'ted',
            external_id: t.external_id,
            title: t.title,
            description: t.description,
            buyer_name: t.buyer_name,
            buyer_country: t.buyer_country,
            cpv_codes: t.cpv_codes,
            procedure_type: t.procedure_type,
            tender_type: t.tender_type,
            estimated_value_eur: t.estimated_value_eur,
            currency: t.currency,
            submission_deadline: t.submission_deadline,
            publication_date: t.publication_date,
            document_url: t.document_url,
            ted_url: t.ted_url,
            language: t.language,
            raw_data: t.raw_data,
          })),
          { onConflict: 'source,external_id' }
        )

      if (error) console.error('Backfill upsert error:', error)

      totalIngested += parsed.length
      hasMore = response.results.length === 100 && page < 10 // Cap at 10 pages (~1000 tenders)
      page++
    }

    // Step 2: Match against this user's profiles
    const { data: profiles } = await serviceClient
      .from('monitoring_profiles')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({
        success: true,
        ingested: totalIngested,
        matched: 0,
        message: 'Tenders ingested but no active profiles to match against.',
      })
    }

    // Get all tenders from the backfill period
    const { data: tenders } = await serviceClient
      .from('tenders')
      .select('*')
      .gte('publication_date', since.toISOString().split('T')[0])

    let totalMatches = 0

    if (tenders && tenders.length > 0) {
      const matches = []

      for (const tender of tenders) {
        for (const profile of profiles) {
          const result = calculateRelevance(
            {
              cpv_codes: tender.cpv_codes,
              title: tender.title,
              description: tender.description,
              buyer_country: tender.buyer_country,
              estimated_value_eur: tender.estimated_value_eur,
            },
            {
              cpv_codes: profile.cpv_codes,
              keywords: profile.keywords,
              exclude_keywords: profile.exclude_keywords,
              countries: profile.countries,
              min_value_eur: profile.min_value_eur,
              max_value_eur: profile.max_value_eur,
            }
          )

          if (result.score >= MATCH_THRESHOLD) {
            matches.push({
              tender_id: tender.id,
              profile_id: profile.id,
              user_id: user.id,
              relevance_score: result.score,
              matched_cpv: result.matched_cpv,
              matched_keywords: result.matched_keywords,
            })
          }
        }
      }

      if (matches.length > 0) {
        const { error } = await serviceClient.from('matches').upsert(
          matches,
          { onConflict: 'tender_id,profile_id' }
        )
        if (error) console.error('Backfill match error:', error)
        totalMatches = matches.length
      }
    }

    return NextResponse.json({
      success: true,
      ingested: totalIngested,
      matched: totalMatches,
      days,
    })
  } catch (error) {
    console.error('Backfill error:', error)
    return NextResponse.json({ error: 'Backfill failed' }, { status: 500 })
  }
}
