'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Building2, Plus, Trash2, Search, Loader2, ExternalLink } from 'lucide-react'

interface FollowedBuyer {
  id: string
  buyer_name: string
  buyer_country: string | null
  ted_search_term: string | null
  created_at: string
}

const COUNTRY_FLAGS: Record<string, string> = {
  DK: '\ud83c\udde9\ud83c\uddf0', NO: '\ud83c\uddf3\ud83c\uddf4', SE: '\ud83c\uddf8\ud83c\uddea',
  DE: '\ud83c\udde9\ud83c\uddea', NL: '\ud83c\uddf3\ud83c\uddf1', FI: '\ud83c\uddeb\ud83c\uddee',
  FR: '\ud83c\uddeb\ud83c\uddf7', UK: '\ud83c\uddec\ud83c\udde7', PL: '\ud83c\uddf5\ud83c\uddf1',
  ES: '\ud83c\uddea\ud83c\uddf8', IT: '\ud83c\uddee\ud83c\uddf9', BE: '\ud83c\udde7\ud83c\uddea',
  DNK: '\ud83c\udde9\ud83c\uddf0', NOR: '\ud83c\uddf3\ud83c\uddf4', SWE: '\ud83c\uddf8\ud83c\uddea',
  DEU: '\ud83c\udde9\ud83c\uddea', NLD: '\ud83c\uddf3\ud83c\uddf1', FIN: '\ud83c\uddeb\ud83c\uddee',
  FRA: '\ud83c\uddeb\ud83c\uddf7', GBR: '\ud83c\uddec\ud83c\udde7', POL: '\ud83c\uddf5\ud83c\uddf1',
}

export function FollowedBuyersList({ initialBuyers }: { initialBuyers: FollowedBuyer[] }) {
  const supabase = createClient()
  const [buyers, setBuyers] = useState<FollowedBuyer[]>(initialBuyers)
  const [newName, setNewName] = useState('')
  const [newCountry, setNewCountry] = useState('DK')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search TED for recent tenders from a buyer
  const [searchResults, setSearchResults] = useState<Record<string, number>>({})
  const [searching, setSearching] = useState<string | null>(null)

  async function addBuyer() {
    if (!newName.trim()) return
    setAdding(true)
    setError(null)

    // Extract a good search term from the name
    const skipWords = new Set(['and', 'the', 'for', 'of', 'de', 'des', 'du', 'og', 'der', 'die', 'und'])
    const words = newName.split(/[\s,.-]+/).filter(w => w.length > 5 && !skipWords.has(w.toLowerCase()))
    const searchTerm = words[0] || newName.split(/\s+/)[0]

    const { data, error: insertErr } = await supabase
      .from('followed_buyers')
      .insert({
        buyer_name: newName.trim(),
        buyer_country: newCountry,
        ted_search_term: searchTerm,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.message.includes('duplicate')) {
        setError('You are already following this buyer.')
      } else {
        setError(insertErr.message)
      }
    } else if (data) {
      setBuyers(prev => [data, ...prev])
      setNewName('')
    }
    setAdding(false)
  }

  async function removeBuyer(id: string) {
    await supabase.from('followed_buyers').delete().eq('id', id)
    setBuyers(prev => prev.filter(b => b.id !== id))
  }

  async function searchBuyerTenders(buyer: FollowedBuyer) {
    setSearching(buyer.id)
    try {
      const searchTerm = buyer.ted_search_term || buyer.buyer_name.split(/\s+/)[0]
      const res = await fetch('/api/buyers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchTerm,
          country: buyer.buyer_country,
        }),
      })
      const data = await res.json()
      setSearchResults(prev => ({ ...prev, [buyer.id]: data.count || 0 }))
    } catch {
      // ignore
    }
    setSearching(null)
  }

  return (
    <div>
      {/* Add buyer form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Follow a new organization</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Organization name (e.g. Forsvarsministeriets Materiel- og Indkøbsstyrelse)"
            onKeyDown={(e) => e.key === 'Enter' && addBuyer()}
          />
          <select
            value={newCountry}
            onChange={(e) => setNewCountry(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="DK">DK</option>
            <option value="NO">NO</option>
            <option value="SE">SE</option>
            <option value="DE">DE</option>
            <option value="NL">NL</option>
            <option value="FI">FI</option>
            <option value="FR">FR</option>
            <option value="UK">UK</option>
          </select>
          <button
            onClick={addBuyer}
            disabled={!newName.trim() || adding}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Follow
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>

      {/* Buyer list */}
      {buyers.length > 0 ? (
        <div className="space-y-3">
          {buyers.map((buyer) => (
            <div
              key={buyer.id}
              className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{buyer.buyer_name}</p>
                  <p className="text-xs text-gray-500">
                    {buyer.buyer_country && `${COUNTRY_FLAGS[buyer.buyer_country] || ''} ${buyer.buyer_country}`}
                    {buyer.ted_search_term && ` \u00b7 Search: "${buyer.ted_search_term}"`}
                    {searchResults[buyer.id] !== undefined && ` \u00b7 ${searchResults[buyer.id]} recent tenders`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => searchBuyerTenders(buyer)}
                  disabled={searching === buyer.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {searching === buyer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                  Check TED
                </button>
                <a
                  href={`https://ted.europa.eu/en/search/result?query=FT~%22${encodeURIComponent(buyer.ted_search_term || buyer.buyer_name)}%22`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  <ExternalLink className="h-3 w-3" />
                  TED
                </a>
                <button
                  onClick={() => removeBuyer(buyer.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Building2 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No followed buyers</h3>
          <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
            Follow contracting authorities to track their procurement activity. You&apos;ll be notified when they publish new tenders.
          </p>
        </div>
      )}
    </div>
  )
}
