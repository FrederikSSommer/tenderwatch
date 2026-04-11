'use client'

import { useState } from 'react'
import { Bookmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { clsx } from 'clsx'

export function BookmarkButton({
  matchId,
  initialBookmarked,
}: {
  matchId: string | undefined
  initialBookmarked: boolean
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked)
  const supabase = createClient()

  async function toggleBookmark() {
    if (!matchId) return
    const newState = !bookmarked
    setBookmarked(newState)
    await supabase
      .from('matches')
      .update({ bookmarked: newState })
      .eq('id', matchId)
  }

  return (
    <button
      onClick={toggleBookmark}
      disabled={!matchId}
      className={clsx(
        'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
        bookmarked
          ? 'border-yellow-300 bg-yellow-50 text-yellow-700'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      )}
    >
      <Bookmark className={clsx('h-4 w-4', bookmarked && 'fill-current')} />
      {bookmarked ? 'Subscribed' : 'Subscribe'}
    </button>
  )
}
