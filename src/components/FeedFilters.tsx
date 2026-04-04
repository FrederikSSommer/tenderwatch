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

  function handleProfileChange(profileId: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (profileId) {
      params.set('profile', profileId)
    } else {
      params.delete('profile')
    }
    router.push(`/dashboard/feed?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-3">
      <select
        value={activeProfile}
        onChange={(e) => handleProfileChange(e.target.value)}
        className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All profiles</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}
