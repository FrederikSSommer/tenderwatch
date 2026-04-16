'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'
import { DashboardSidebar } from './DashboardSidebar'

export function DashboardShell({
  children,
  userEmail,
  plan,
  isDemo = false,
}: {
  children: React.ReactNode
  userEmail: string
  plan: string
  isDemo?: boolean
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar whenever the route changes (user tapped a nav link)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  return (
    <div className="flex h-[100dvh] bg-gray-50">
      {/* Backdrop — mobile only, sits behind sidebar, above content */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar wrapper: fixed+translated on mobile, static on desktop */}
      <div
        className={clsx(
          'fixed inset-y-0 left-0 z-30 transition-transform duration-300 ease-in-out',
          'lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <DashboardSidebar
          userEmail={userEmail}
          plan={plan}
          isDemo={isDemo}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — hidden on lg+ where sidebar is always visible */}
        <div className="flex h-14 shrink-0 items-center border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="ml-3 text-base font-bold text-gray-900">
            TenderWatch
          </Link>
        </div>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
