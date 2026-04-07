import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  Target, Bell, Calendar, TrendingUp, ArrowRight,
  Building2, Clock, Zap, BarChart3,
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Fetch all data in parallel
  const [profilesRes, matchesRes, recentMatchesRes, deadlinesRes, followedBuyersRes] = await Promise.all([
    supabase
      .from('monitoring_profiles')
      .select('id, name, cpv_codes, keywords, countries, active')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),

    // Matches from last 24h
    supabase
      .from('matches')
      .select('id, relevance_score')
      .eq('user_id', user.id)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

    // Recent high-relevance matches for the feed preview
    supabase
      .from('matches')
      .select('id, relevance_score, matched_keywords, created_at, tender:tenders(id, title, buyer_name, buyer_country, submission_deadline, estimated_value_eur)')
      .eq('user_id', user.id)
      .gte('relevance_score', 40)
      .order('created_at', { ascending: false })
      .limit(5),

    // Upcoming deadlines
    supabase
      .from('matches')
      .select('id, tender:tenders(id, title, buyer_name, submission_deadline)')
      .eq('user_id', user.id)
      .eq('bookmarked', true)
      .order('created_at', { ascending: false })
      .limit(20),

    // Followed buyers count
    supabase
      .from('followed_buyers')
      .select('id')
      .eq('user_id', user.id),
  ])

  const profiles = profilesRes.data || []
  const todayMatches = matchesRes.data || []
  const recentMatches = recentMatchesRes.data || []
  const allBookmarked = deadlinesRes.data || []
  const followedBuyers = followedBuyersRes.data || []

  // Compute stats
  const highRelevance = todayMatches.filter(m => m.relevance_score >= 80).length
  const medRelevance = todayMatches.filter(m => m.relevance_score >= 40 && m.relevance_score < 80).length
  const activeProfiles = profiles.filter(p => p.active).length

  // Get upcoming deadlines from bookmarked tenders
  const now = new Date()
  const upcomingDeadlines = allBookmarked
    .filter((m: any) => m.tender?.submission_deadline && new Date(m.tender.submission_deadline) > now)
    .sort((a: any, b: any) => new Date(a.tender.submission_deadline).getTime() - new Date(b.tender.submission_deadline).getTime())
    .slice(0, 5)

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Your procurement intelligence at a glance</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Bell className="h-5 w-5 text-blue-600" />}
          label="New matches today"
          value={todayMatches.length}
          detail={highRelevance > 0 ? `${highRelevance} high relevance` : medRelevance > 0 ? `${medRelevance} medium` : undefined}
          href="/feed"
        />
        <StatCard
          icon={<Target className="h-5 w-5 text-purple-600" />}
          label="Active profiles"
          value={activeProfiles}
          detail={`${profiles.length} total`}
          href="/profiles"
        />
        <StatCard
          icon={<Building2 className="h-5 w-5 text-green-600" />}
          label="Followed buyers"
          value={followedBuyers.length}
          href="/buyers"
        />
        <StatCard
          icon={<Calendar className="h-5 w-5 text-amber-600" />}
          label="Upcoming deadlines"
          value={upcomingDeadlines.length}
          href="/calendar"
        />
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
              <Link href="/feed" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentMatches.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {recentMatches.map((match: any) => (
                  <Link
                    key={match.id}
                    href={`/tender/${match.tender?.id}`}
                    className="block px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {match.tender?.title || 'Untitled'}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {match.tender?.buyer_name || 'Unknown buyer'}
                          {match.tender?.buyer_country && ` \u00b7 ${match.tender.buyer_country}`}
                        </p>
                      </div>
                      <ScoreBadge score={match.relevance_score} />
                    </div>
                    {match.matched_keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {match.matched_keywords.slice(0, 4).map((kw: string) => (
                          <span key={kw} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{kw}</span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-10 text-center">
                <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No matches yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  {profiles.length > 0
                    ? 'Tenders will appear here after the daily scan runs.'
                    : 'Create a monitoring profile to start matching.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Active profiles */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-purple-600" />
                Profiles
              </h2>
              <Link href="/profiles" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {profiles.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {profiles.slice(0, 4).map((p) => (
                  <Link key={p.id} href={`/profiles/${p.id}`} className="block px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {p.cpv_codes.length} CPV \u00b7 {p.keywords.length} keywords \u00b7 {p.countries.join(', ')}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-gray-500">No profiles yet</p>
                <Link
                  href="/onboarding"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Zap className="h-3 w-3" /> Create with AI wizard
                </Link>
              </div>
            )}
          </div>

          {/* Upcoming deadlines */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                Upcoming deadlines
              </h2>
              <Link href="/calendar" className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                Calendar <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {upcomingDeadlines.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {upcomingDeadlines.map((m: any) => {
                  const dl = new Date(m.tender.submission_deadline)
                  const daysLeft = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                  return (
                    <Link key={m.id} href={`/tender/${m.tender.id}`} className="block px-5 py-3 hover:bg-gray-50">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.tender.title}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-500">{m.tender.buyer_name}</p>
                        <span className={`text-xs font-medium ${daysLeft <= 7 ? 'text-red-600' : daysLeft <= 14 ? 'text-amber-600' : 'text-gray-500'}`}>
                          {daysLeft}d left
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-gray-500">No upcoming deadlines</p>
                <p className="text-xs text-gray-400 mt-1">Bookmark tenders to track their deadlines here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  detail,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: number
  detail?: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="bg-white rounded-lg border border-gray-200 p-5 hover:border-gray-300 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{label}</p>
          {detail && <p className="text-xs text-blue-600 mt-0.5">{detail}</p>}
        </div>
      </div>
    </Link>
  )
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80
    ? 'bg-green-100 text-green-800'
    : score >= 40
    ? 'bg-yellow-100 text-yellow-800'
    : 'bg-gray-100 text-gray-600'
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {Math.round(score)}
    </span>
  )
}
