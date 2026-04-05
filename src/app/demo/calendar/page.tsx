import { getDemoMatchesWithTenders } from '@/lib/demo-data'
import { formatDate } from '@/lib/utils/date'
import { formatEUR } from '@/lib/utils/currency'
import Link from 'next/link'

export default function DemoCalendarPage() {
  const matches = getDemoMatchesWithTenders()

  const grouped = new Map<string, typeof matches>()
  for (const m of matches) {
    if (!m.tender.submission_deadline) continue
    const dateKey = m.tender.submission_deadline.split('T')[0]
    const existing = grouped.get(dateKey) || []
    existing.push(m)
    grouped.set(dateKey, existing)
  }

  const sortedDates = [...grouped.keys()].sort()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Deadline Calendar</h1>

      <div className="space-y-6">
        {sortedDates.map((date) => (
          <div key={date}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
              {formatDate(date)}
            </h2>
            <div className="space-y-2">
              {grouped.get(date)!.map((item) => (
                <Link
                  key={item.id}
                  href={`/demo/tender/${item.tender.id}`}
                  className="block rounded-lg border border-gray-200 bg-white p-3 hover:border-gray-300 transition-colors"
                >
                  <p className="font-medium text-gray-900 text-sm">{item.tender.title}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {item.tender.buyer_name}
                    {item.tender.estimated_value_eur && ` · ${formatEUR(item.tender.estimated_value_eur)}`}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
