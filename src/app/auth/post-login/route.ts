import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Handles redirect after OTP code verification (verifyOtp sets the session
// client-side, so there's no code to exchange — just check the session).
export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url)
  const next = searchParams.get('next') ?? '/feed'

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profiles } = await supabase
      .from('monitoring_profiles')
      .select('id')
      .eq('user_id', user.id)
      .limit(1)

    if (!profiles || profiles.length === 0) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
