import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatDate, formatDeadline } from '@/lib/utils/date'
import { formatEUR } from '@/lib/utils/currency'
import { AISummarySection } from '@/components/AISummarySection'
import { BookmarkButton } from '@/components/BookmarkButton'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data: tender } = await supabase
    .from('tenders')
    .select('*')
    .eq('id', id)
    .single()

  if (!tender) notFound()

  const { data: { user } } = await supabase.auth.getUser()

  // Check if user has a match for this tender (for bookmark status)
  let match = null
  if (user) {
    const { data } = await supabase
      .from('matches')
      .select('*')
      .eq('tender_id', id)
      .eq('user_id', user.id)
      .single()
    match = data
  }

  return (
    <div className="p-6 max-w-4xl">
      <Link
        href="/dashboard/feed"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to feed
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">{tender.title}</h1>
      <p className="mt-1 text-gray-600">{tender.buyer_name}</p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
        {tender.buyer_country && (
          <span>{tender.buyer_country}</span>
        )}
        <span>{formatEUR(tender.estimated_value_eur)}</span>
        {tender.procedure_type && <span>{tender.procedure_type}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
        <span>Published: {formatDate(tender.publication_date)}</span>
        <span>Deadline: {formatDeadline(tender.submission_deadline)}</span>
      </div>

      {tender.cpv_codes && tender.cpv_codes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tender.cpv_codes.map((code: string) => (
            <span
              key={code}
              className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
            >
              CPV: {code}
            </span>
          ))}
        </div>
      )}

      <div className="mt-6">
        <AISummarySection
          tenderId={tender.id}
          existingSummary={tender.ai_summary}
        />
      </div>

      <div className="mt-6 flex gap-3">
        {tender.ted_url && (
          <a
            href={tender.ted_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Open on TED
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        {tender.document_url && (
          <a
            href={tender.document_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Download docs
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <BookmarkButton
          matchId={match?.id}
          initialBookmarked={match?.bookmarked ?? false}
        />
      </div>

      {tender.description && (
        <div className="mt-8 border-t pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Full description</h2>
          <div className="prose prose-gray max-w-none text-sm whitespace-pre-wrap">
            {tender.description}
          </div>
        </div>
      )}
    </div>
  )
}
