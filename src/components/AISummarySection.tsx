'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

interface AISummarySectionProps {
  tenderId: string
  existingSummary: string | null
}

export function AISummarySection({ tenderId, existingSummary }: AISummarySectionProps) {
  const [summary, setSummary] = useState(existingSummary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function generateSummary() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenderId }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to generate summary')
      }
      const data = await response.json()
      setSummary(data.summary)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  if (summary) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-blue-900">AI Summary</h3>
        </div>
        <div className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">
          {summary}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gray-400" />
          <span className="text-sm text-gray-600">AI summary available</span>
        </div>
        <button
          onClick={generateSummary}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Generate summary
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
