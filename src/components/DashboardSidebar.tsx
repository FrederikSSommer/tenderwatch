'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Bookmark,
  Calendar,
  Settings,
  Target,
  LogOut,
  Zap,
  Building2,
  Rss,
} from 'lucide-react'
import { clsx } from 'clsx'

const baseNavigation = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Tender Feed', path: '/feed', icon: Rss },
  { name: 'Profiles', path: '/profiles', icon: Target },
  { name: 'Buyers', path: '/buyers', icon: Building2 },
  { name: 'Subscribed', path: '/bookmarks', icon: Bookmark },
  { name: 'Calendar', path: '/calendar', icon: Calendar },
]

export function DashboardSidebar({
  userEmail,
  plan,
  isDemo = false,
}: {
  userEmail: string
  plan: string
  isDemo?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const prefix = isDemo ? '/demo' : ''

  const navigation = [
    ...baseNavigation.map(item => ({ ...item, href: `${prefix}${item.path}` })),
    ...(!isDemo ? [{ name: 'Settings', path: '/settings', href: `${prefix}/settings`, icon: Settings }] : []),
  ]

  async function handleSignOut() {
    if (isDemo) {
      router.push('/')
      return
    }
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  return (
    <div className="flex w-64 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center px-6 border-b border-gray-200">
        <Link href="/" className="text-xl font-bold text-gray-900">
          TenderWatch
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-gray-200 p-4 space-y-3">
        {isDemo && (
          <Link
            href="/signup"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Sign up free
          </Link>
        )}
        {!isDemo && plan === 'free' && (
          <Link
            href="/settings?tab=billing"
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            <Zap className="h-4 w-4" />
            Upgrade
          </Link>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 truncate max-w-[160px]">{userEmail}</span>
          <button
            onClick={handleSignOut}
            className="text-gray-400 hover:text-gray-600"
            title={isDemo ? 'Exit demo' : 'Sign out'}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 capitalize">
          {plan} plan
        </span>
      </div>
    </div>
  )
}
