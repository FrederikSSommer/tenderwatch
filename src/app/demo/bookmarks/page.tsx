import { getDemoMatchesWithTenders } from '@/lib/demo-data'
import { TenderCard } from '@/components/TenderCard'
import { Bookmark } from 'lucide-react'

export default function DemoBookmarksPage() {
  const bookmarked = getDemoMatchesWithTenders().filter(m => m.bookmarked)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Subscribed Tenders</h1>
      <p className="text-sm text-gray-600 mb-6">
        Tenders you subscribe to teach the system what&apos;s relevant — future matches get scored higher when they look like ones you&apos;ve subscribed to.
      </p>

      {bookmarked.length > 0 ? (
        <div className="space-y-3">
          {bookmarked.map((match) => (
            <TenderCard
              key={match.id}
              tender={match.tender}
              relevanceScore={match.relevance_score}
              matchedCpv={match.matched_cpv}
              matchedKeywords={match.matched_keywords}
              bookmarked={true}
              matchId={match.id}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Bookmark className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No subscriptions yet</h3>
        </div>
      )}
    </div>
  )
}
