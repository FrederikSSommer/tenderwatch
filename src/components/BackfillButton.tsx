'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, History, CheckCircle, AlertCircle } from 'lucide-react'

const PERIOD_OPTIONS = [
  { value: 7, label: '1 week' },
  { value: 14, label: '2 weeks' },
  { value: 30, label: '1 month' },
  { value: 60, label: '2 months' },
  { value: 90, label: '3 months' },
]

interface BackfillResult {
  success: boolean
  ingested: number
  matched: number
  days: number
  error?: string
  message?: string
}

export function BackfillButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BackfillResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleBackfill() {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const response = await fetch('/api/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Backfill failed')
      } else {
        setResult(data)
        router.refresh()
      }
    } catch {
      setError('Network error — please try again')
    }

    setLoading(false)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleBackfill}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </>
          ) : (
            <>
              <History className="h-4 w-4" />
              Search
            </>
          )}
        </button>
        {result && (
          <span className="text-sm text-green-600 flex items-center gap-1">
            <CheckCircle className="h-4 w-4" />
            {result.matched} matches found
          </span>
        )}
        {error && (
          <span className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {error}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex items-start gap-3 mb-4">
        <History className="h-5 w-5 text-blue-600 mt-0.5" />
        <div>
          <h3 className="font-semibold text-gray-900">Search historical tenders</h3>
          <p className="text-sm text-gray-500 mt-1">
            Fetch tenders published in the past and match them against your profiles.
            This searches the EU TED database and adds matching tenders to your feed.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Go back:</label>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleBackfill}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching TED...
            </>
          ) : (
            <>
              <History className="h-4 w-4" />
              Fetch tenders
            </>
          )}
        </button>
      </div>

      {loading && (
        <p className="mt-3 text-sm text-gray-500">
          This may take a minute depending on the time range...
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <p className="font-medium text-green-800">Backfill complete</p>
          </div>
          <ul className="mt-2 text-sm text-green-700 space-y-1">
            <li>Searched the past {result.days} days</li>
            <li>{result.ingested} tenders fetched from TED</li>
            <li><strong>{result.matched} tenders matched</strong> your profiles</li>
          </ul>
          {result.message && (
            <p className="mt-2 text-sm text-green-600">{result.message}</p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
