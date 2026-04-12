import { DEMO_TENDERS, DEMO_MATCHES } from '@/lib/demo-data'
import { notFound } from 'next/navigation'
import { formatDate, formatDeadline } from '@/lib/utils/date'
import { formatEUR } from '@/lib/utils/currency'
import { ArrowLeft, ExternalLink, Bookmark, Sparkles } from 'lucide-react'
import Link from 'next/link'

export default async function DemoTenderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tender = DEMO_TENDERS.find(t => t.id === id)
  if (!tender) notFound()

  const match = DEMO_MATCHES.find(m => m.tender_id === id)

  return (
    <div className="p-6 max-w-4xl">
      <Link
        href="/demo/feed"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to feed
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">{tender.title}</h1>
      <p className="mt-1 text-gray-600">{tender.buyer_name}</p>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
        {tender.buyer_country && <span>{tender.buyer_country}</span>}
        <span>{formatEUR(tender.estimated_value_eur)}</span>
        {tender.procedure_type && <span>{tender.procedure_type}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
        <span>Published: {formatDate(tender.publication_date)}</span>
        <span>Deadline: {formatDeadline(tender.submission_deadline)}</span>
      </div>

      {tender.cpv_codes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tender.cpv_codes.map((code) => (
            <span
              key={code}
              className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
            >
              CPV: {code}
            </span>
          ))}
        </div>
      )}

      {/* AI Summary */}
      {tender.ai_summary ? (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-semibold text-blue-900">AI Summary</h3>
          </div>
          <div className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">
            {tender.ai_summary}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gray-400" />
              <span className="text-sm text-gray-600">AI summary available</span>
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Sparkles className="h-4 w-4" />
              Generate summary
            </button>
          </div>
        </div>
      )}

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
        <button
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            match?.bookmarked
              ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Bookmark className={`h-4 w-4 ${match?.bookmarked ? 'fill-current' : ''}`} />
          {match?.bookmarked ? 'Followed' : 'Follow'}
        </button>
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
