import { updateSession } from '@/lib/supabase/middleware'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/feed/:path*', '/profiles/:path*', '/bookmarks/:path*', '/calendar/:path*', '/settings/:path*', '/onboarding/:path*', '/tender/:path*'],
}
