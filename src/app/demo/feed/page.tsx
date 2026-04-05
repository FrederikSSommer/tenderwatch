import { Suspense } from 'react'
import { getDemoMatchesWithTenders, DEMO_PROFILES } from '@/lib/demo-data'
import { TenderCard } from '@/components/TenderCard'
import { FeedFilters } from '@/components/FeedFilters'

export default function DemoFeedPage() {
  const matches = getDemoMatchesWithTenders()

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tender Feed</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tenders matching your monitoring profiles, ranked by relevance
        </p>
      </div>

      <Suspense fallback={<div className="h-10" />}>
        <FeedFilters profiles={DEMO_PROFILES} />
      </Suspense>

      <div className="mt-6 space-y-3">
        {matches.map((match) => (
          <TenderCard
            key={match.id}
            tender={match.tender}
            relevanceScore={match.relevance_score}
            matchedCpv={match.matched_cpv}
            matchedKeywords={match.matched_keywords}
            bookmarked={match.bookmarked}
            matchId={match.id}
          />
        ))}
      </div>
    </div>
  )
}
