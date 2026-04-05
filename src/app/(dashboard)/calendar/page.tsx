import { createServerSupabaseClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils/date'
import { formatEUR } from '@/lib/utils/currency'
import { Calendar as CalendarIcon } from 'lucide-react'
import Link from 'next/link'

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: matches } = await supabase
    .from('matches')
    .select('*, tender:tenders(*)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  // Group by deadline date
  const grouped = new Map<string, { match: Record<string, unknown>; tender: Record<string, unknown> }[]>()
  for (const match of matches || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tender = (match as any).tender
    if (!tender?.submission_deadline) continue
    const dateKey = tender.submission_deadline.split('T')[0]
    const existing = grouped.get(dateKey) || []
    existing.push({ match, tender })
    grouped.set(dateKey, existing)
  }

  const sortedDates = [...grouped.keys()].sort()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Deadline Calendar</h1>

      {sortedDates.length > 0 ? (
        <div className="space-y-6">
          {sortedDates.map((date) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                {formatDate(date)}
              </h2>
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {grouped.get(date)!.map((item: any) => (
                  <Link
                    key={item.tender.id}
                    href={`/tender/${item.tender.id}`}
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
      ) : (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No upcoming deadlines</h3>
          <p className="mt-2 text-sm text-gray-500">
            Matched tenders with deadlines will appear here.
          </p>
        </div>
      )}
    </div>
  )
}
