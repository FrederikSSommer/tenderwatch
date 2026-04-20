'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Profile {
  id: string
  name: string
}

export function FeedFilters({ profiles }: { profiles: Profile[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeProfile = searchParams.get('profile') || ''
  const activeSort = searchParams.get('sort') || 'relevance'

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/feed?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select
        value={activeProfile}
        onChange={(e) => update('profile', e.target.value || null)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All profiles</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
        {(['relevance', 'date'] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => update('sort', opt === 'relevance' ? null : opt)}
            className={`px-3 py-2 transition-colors ${
              activeSort === opt
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {opt === 'relevance' ? 'Relevance' : 'Date'}
          </button>
        ))}
      </div>
    </div>
  )
}
