import Link from 'next/link'
import {
  Target, Bell, Calendar, TrendingUp, ArrowRight,
  Clock, Zap, BarChart3,
} from 'lucide-react'
import { getDemoMatchesWithTenders, DEMO_PROFILES } from '@/lib/demo-data'

export default function DemoDashboardPage() {
  const matches = getDemoMatchesWithTenders()
  const highRelevance = matches.filter(m => m.relevance_score >= 80)
  const recentMatches = matches.slice(0, 5)
  const activeProfiles = DEMO_PROFILES.length

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Your procurement intelligence at a glance</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <Link href="/demo/feed" className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{matches.length}</p>
              <p className="text-xs text-gray-500">New matches today</p>
              {highRelevance.length > 0 && <p className="text-xs text-blue-600 mt-0.5">{highRelevance.length} high relevance</p>}
            </div>
          </div>
        </Link>
        <Link href="/demo/profiles" className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{activeProfiles}</p>
              <p className="text-xs text-gray-500">Active profiles</p>
            </div>
          </div>
        </Link>
        <Link href="/demo/calendar" className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">3</p>
              <p className="text-xs text-gray-500">Upcoming deadlines</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent matches */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                Recent matches
              </h2>
              <Link href="/demo/feed" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {recentMatches.map((match: any) => (
                <Link
                  key={match.id}
                  href={`/demo/tender/${match.tender?.id}`}
                  className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {match.tender?.title || 'Untitled'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {match.tender?.buyer_name || 'Unknown buyer'}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                      match.relevance_score >= 80 ? 'bg-green-100 text-green-800'
                      : match.relevance_score >= 40 ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                      {Math.round(match.relevance_score)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-600" />
                Profiles
              </h2>
              <Link href="/demo/profiles" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm font-medium text-gray-900">Maritime Engineering</p>
              <p className="text-xs text-gray-500 mt-0.5">5 CPV · 8 keywords · DK, NO</p>
              <span className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Active</span>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 px-5 py-6 text-center">
            <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">AI learns from your feedback</p>
            <p className="text-xs text-gray-400 mt-1">Follow or dismiss tenders to improve your matches.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
