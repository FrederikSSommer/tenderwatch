import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard/feed'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Check if user needs onboarding (no monitoring profiles yet)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profiles } = await supabase
          .from('monitoring_profiles')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)

        if (!profiles || profiles.length === 0) {
          return NextResponse.redirect(`${origin}/dashboard/onboarding`)
        }
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
