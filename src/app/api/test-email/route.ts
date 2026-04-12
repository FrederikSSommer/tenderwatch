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

  const sampleTenders = [
    {
      id: 'test-001',
      title: 'Ship Hull Structural Analysis Services — Danish Navy',
      buyer_name: 'Danish Defence Acquisition and Logistics Organisation',
      buyer_country: 'DK',
      estimated_value_eur: 2500000,
      submission_deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      relevance_score: 92,
      cpv_codes: ['71327000', '71300000'],
      ai_reason: 'Directly relevant — structural analysis for naval vessel hulls matches maritime engineering profile',
    },
    {
      id: 'test-002',
      title: 'Naval Vessel Design Consultancy — Corvette Class',
      buyer_name: 'Norwegian Defence Materiel Agency',
      buyer_country: 'NO',
      estimated_value_eur: 4100000,
      submission_deadline: new Date(Date.now() + 45 * 86400000).toISOString(),
      relevance_score: 87,
      cpv_codes: ['71300000', '34513300'],
      ai_reason: 'Corvette-class vessel design consultancy aligns with naval engineering expertise',
    },
    {
      id: 'test-003',
      title: 'Offshore Wind Farm Foundation Design — Kriegers Flak II',
      buyer_name: 'Energinet',
      buyer_country: 'DK',
      estimated_value_eur: 3200000,
      submission_deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
      relevance_score: 65,
      cpv_codes: ['71312000', '71327000'],
      ai_reason: 'Offshore wind foundation design requires structural engineering expertise',
    },
    {
      id: 'test-004',
      title: 'Maritime Safety Equipment Inspection Services',
      buyer_name: 'Swedish Transport Agency',
      buyer_country: 'SE',
      estimated_value_eur: 650000,
      submission_deadline: new Date(Date.now() + 15 * 86400000).toISOString(),
      relevance_score: 45,
      cpv_codes: ['71300000'],
      ai_reason: 'Maritime safety inspection — tangentially related to maritime sector',
    },
  ]

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
