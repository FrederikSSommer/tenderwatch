'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { formatDeadline } from '@/lib/utils/date'
import { formatEUR } from '@/lib/utils/currency'
import { Sparkles, Bookmark, X } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'

interface TenderCardProps {
  tender: {
    id: string
    title: string
    buyer_name: string | null
    buyer_country: string | null
    estimated_value_eur: number | null
    submission_deadline: string | null
    cpv_codes: string[]
  }
  relevanceScore: number
  matchedCpv: string[]
  matchedKeywords: string[]
  bookmarked: boolean
  dismissed?: boolean
  matchId: string
  aiReason?: string | null
}

function getScoreColor(score: number) {
  if (score >= 80) return 'bg-green-100 text-green-800'
  if (score >= 40) return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-600'
}

function getScoreDot(score: number) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-gray-400'
}

export function TenderCard({
  tender,
  relevanceScore,
  matchedCpv,
  matchedKeywords,
  bookmarked,
  dismissed: initialDismissed,
  matchId,
  aiReason,
}: TenderCardProps) {
  const pathname = usePathname()
  const prefix = pathname.startsWith('/demo') ? '/demo' : ''
  const [followed, setFollowed] = useState(bookmarked)
  const [dismissed, setDismissed] = useState(initialDismissed ?? false)
  const supabase = createClient()

  async function toggleFollow() {
    if (!matchId) return
    const newState = !followed
    setFollowed(newState)
    await supabase
      .from('matches')
      .update({ bookmarked: newState })
      .eq('id', matchId)
  }

  async function handleDismiss() {
    if (!matchId) return
    setDismissed(true)
    await supabase
      .from('matches')
      .update({ dismissed: true })
      .eq('id', matchId)
  }

  if (dismissed) {
    return (
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
        <p className="text-sm text-gray-400 italic">Dismissed: {tender.title.slice(0, 60)}...</p>
        <button
          onClick={async () => {
            setDismissed(false)
            await supabase.from('matches').update({ dismissed: false }).eq('id', matchId)
          }}
          className="text-xs text-blue-600 hover:underline"
        >
          Undo
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('inline-flex h-2 w-2 rounded-full', getScoreDot(relevanceScore))} />
            <span className={clsx('text-xs font-semibold px-1.5 py-0.5 rounded', getScoreColor(relevanceScore))}>
              {Math.round(relevanceScore)}
            </span>
            <Link
              href={`${prefix}/tender/${tender.id}`}
              className="text-base font-semibold text-gray-900 hover:text-blue-600 truncate"
            >
              {tender.title}
            </Link>
          </div>

          <p className="text-sm text-gray-600">
            {tender.buyer_name || 'Unknown buyer'}
            {tender.buyer_country && ` · ${tender.buyer_country}`}
            {tender.estimated_value_eur && ` · ${formatEUR(tender.estimated_value_eur)}`}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>Deadline: {formatDeadline(tender.submission_deadline)}</span>
            {tender.cpv_codes.slice(0, 3).map((code) => (
              <span key={code} className="rounded bg-gray-100 px-1.5 py-0.5">
                {code}
              </span>
            ))}
          </div>

          {matchedKeywords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {matchedKeywords.map((kw) => (
                <span key={kw} className="text-xs rounded bg-blue-50 text-blue-700 px-1.5 py-0.5">
                  {kw}
                </span>
              ))}
            </div>
          )}

          {aiReason && (
            <p className="mt-1.5 text-xs text-blue-600 italic flex items-center gap-1">
              <Sparkles className="h-3 w-3 flex-shrink-0" />
              {aiReason}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={toggleFollow}
            className={clsx(
              'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1',
              followed
                ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            )}
          >
            <Bookmark className={clsx('h-3 w-3', followed && 'fill-current')} />
            {followed ? 'Followed' : 'Follow'}
          </button>
          <Link
            href={`${prefix}/tender/${tender.id}`}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            View
          </Link>
          <Link
            href={`${prefix}/tender/${tender.id}?summary=true`}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 flex items-center gap-1"
          >
            <Sparkles className="h-3 w-3" />
            AI
          </Link>
          <button
            onClick={handleDismiss}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors flex items-center gap-1"
            title="Not relevant — dismiss and teach AI"
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
