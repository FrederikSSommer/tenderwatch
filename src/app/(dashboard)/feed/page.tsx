import { Suspense } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TenderCard } from '@/components/TenderCard'
import { FeedFilters } from '@/components/FeedFilters'

function formatDateHeading(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00Z')
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return dateStr
  }
}

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {formatDateHeading(date)}
      </span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  )
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string; sort?: string }>
}) {
  const params = await searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const sort = params.sort === 'date' ? 'date' : 'relevance'

  const { data: profiles } = await supabase
    .from('monitoring_profiles')
    .select('*')
    .eq('user_id', user.id)

  let query = supabase
    .from('matches')
    .select(`*, tender:tenders(*)`)
    .eq('user_id', user.id)
    .eq('dismissed', false)
    .order('relevance_score', { ascending: false })
    .limit(200)

  if (params.profile) {
    query = query.eq('profile_id', params.profile)
  }

  const { data: rawMatches } = await query
  const allMatches: any[] = (rawMatches ?? []) as any[]
  const matches: any[] =
    sort === 'date'
      ? [...allMatches].sort((a, b) => {
          const da = a?.tender?.publication_date ?? ''
          const db = b?.tender?.publication_date ?? ''
          return db.localeCompare(da)
        })
      : allMatches

  function groupByDate(items: any[]): { date: string; items: any[] }[] {
    const groups: { date: string; items: any[] }[] = []
    for (const m of items) {
      const date = m?.tender?.publication_date ?? 'Unknown'
      const last = groups[groups.length - 1]
      if (last?.date === date) {
        last.items.push(m)
      } else {
        groups.push({ date, items: [m] })
      }
    }
    return groups
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tender Feed</h1>
        <p className="text-sm text-gray-500 mt-1">
          {sort === 'date'
            ? 'Tenders matching your profiles, sorted by publication date'
            : 'Tenders matching your monitoring profiles, ranked by relevance'}
        </p>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <FeedFilters profiles={profiles || []} />
      </Suspense>

      <div className="mt-6 space-y-3">
        {matches.length > 0 ? (
          sort === 'date' ? (
            groupByDate(matches).map((group) => (
              <div key={group.date}>
                <DateDivider date={group.date} />
                <div className="space-y-3 mt-3">
                  {group.items.map((match: any) => (
                    <TenderCard
                      key={match.id}
                      tender={match.tender}
                      relevanceScore={match.relevance_score}
                      matchedCpv={match.matched_cpv}
                      matchedKeywords={match.matched_keywords}
                      bookmarked={match.bookmarked}
                      dismissed={match.dismissed}
                      matchId={match.id}
                      aiReason={match.ai_reason}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            matches.map((match: any) => (
              <TenderCard
                key={match.id}
                tender={match.tender}
                relevanceScore={match.relevance_score}
                matchedCpv={match.matched_cpv}
                matchedKeywords={match.matched_keywords}
                bookmarked={match.bookmarked}
                dismissed={match.dismissed}
                matchId={match.id}
                aiReason={match.ai_reason}
              />
            ))
          )
        ) : (
          <div className="text-center py-16">
            <LayoutDashboardIcon />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No tenders yet</h3>
            <p className="mt-2 text-sm text-gray-500">
              {profiles && profiles.length > 0
                ? 'New tenders will appear here after our daily scan. Check back tomorrow!'
                : 'Create a monitoring profile to start finding relevant tenders.'}
            </p>
            {(!profiles || profiles.length === 0) && (
              <a
                href="/profiles"
                className="mt-4 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create profile
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function LayoutDashboardIcon() {
  return (
    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}
