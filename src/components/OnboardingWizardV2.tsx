'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { BackfillButton } from './BackfillButton'
import {
  Loader2, ArrowRight, ArrowLeft, Sparkles, ThumbsUp, ThumbsDown,
  CheckCircle, ExternalLink, Building2, Search, Target,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

interface Sector { id: string; label: string; emoji?: string }

interface ExampleTender {
  id: string
  title: string
  buyerName: string | null
  buyerCountry: string | null
  cpvCodes: string[]
  estimatedValue: number | null
  description: string | null
  tedUrl: string
  noticeType: string | null
}

interface Buyer { id: string; name: string; label: string; country: string }

interface GeneratedProfile {
  cpv_codes: string[]
  keywords: string[]
  exclude_keywords: string[]
  countries: string[]
  min_value_eur: number | null
  max_value_eur: number | null
  profile_name: string
  reasoning: string
}

type Phase = 'basics' | 'sectors' | 'subsectors' | 'buyers' | 'tenders' | 'generating' | 'review' | 'done'

const COUNTRIES = [
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
]

const VALUE_RANGES = [
  { id: 'any', label: 'Any value', range: null },
  { id: 'small', label: 'Under EUR 500k', range: [null, 500000] },
  { id: 'medium', label: 'EUR 500k - 2M', range: [500000, 2000000] },
  { id: 'large', label: 'EUR 2M - 10M', range: [2000000, 10000000] },
  { id: 'xlarge', label: 'Over EUR 10M', range: [10000000, null] },
]

// ─── Sub-components ───────────────────────────────────────────────────

function AiMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-6">
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-blue-600" />
      </div>
      <div className="bg-gray-50 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-700 max-w-lg">
        {children}
      </div>
    </div>
  )
}

function ChoiceChip({
  label,
  emoji,
  selected,
  onClick,
}: {
  label: string
  emoji?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-all ${
        selected
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-300 hover:bg-blue-50'
      }`}
    >
      {emoji && <span>{emoji}</span>}
      {label}
    </button>
  )
}

function TenderExampleCard({
  tender,
  liked,
  disliked,
  onLike,
  onDislike,
}: {
  tender: ExampleTender
  liked: boolean
  disliked: boolean
  onLike: () => void
  onDislike: () => void
}) {
  return (
    <div className={`rounded-xl border p-4 transition-all ${
      liked ? 'border-green-300 bg-green-50' : disliked ? 'border-red-200 bg-red-50/50 opacity-60' : 'border-gray-200 bg-white'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 text-sm leading-snug">{tender.title}</h4>
          <p className="text-xs text-gray-500 mt-1">
            {tender.buyerName || 'Unknown buyer'}
            {tender.buyerCountry && ` · ${tender.buyerCountry}`}
            {tender.estimatedValue && ` · EUR ${(tender.estimatedValue / 1000).toFixed(0)}k`}
          </p>
          {tender.description && (
            <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{tender.description}</p>
          )}
          {tender.cpvCodes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tender.cpvCodes.slice(0, 3).map(c => (
                <span key={c} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{c}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={onLike}
            className={`p-2 rounded-lg transition-colors ${
              liked ? 'bg-green-200 text-green-700' : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-600'
            }`}
            title="I'd want this tender"
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            onClick={onDislike}
            className={`p-2 rounded-lg transition-colors ${
              disliked ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-600'
            }`}
            title="Not relevant"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Wizard ──────────────────────────────────────────────────────

export function OnboardingWizardV2({ isPublic = false }: { isPublic?: boolean }) {
  const router = useRouter()
  const supabase = createClient()

  // Phase tracking
  const [phase, setPhase] = useState<Phase>('basics')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: Basics
  const [companyName, setCompanyName] = useState('')
  const [description, setDescription] = useState('')
  const [country, setCountry] = useState('DK')

  // Step 2: Sectors
  const [availableSectors, setAvailableSectors] = useState<Sector[]>([])
  const [selectedSectorIds, setSelectedSectorIds] = useState<Set<string>>(new Set())

  // Step 3: Subsectors + preferences
  const [availableSubsectors, setAvailableSubsectors] = useState<Sector[]>([])
  const [selectedSubsectorIds, setSelectedSubsectorIds] = useState<Set<string>>(new Set())
  const [selectedCountries, setSelectedCountries] = useState<Set<string>>(new Set(['DK']))
  const [valueRange, setValueRange] = useState('any')

  // Step 4: Buyers
  const [availableBuyers, setAvailableBuyers] = useState<Buyer[]>([])
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<Set<string>>(new Set())
  const [customBuyer, setCustomBuyer] = useState('')

  // Step 5: Tender swiping
  const [exampleTenders, setExampleTenders] = useState<ExampleTender[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [dislikedIds, setDislikedIds] = useState<Set<string>>(new Set())

  // Step 6: Generated profile
  const [generatedProfile, setGeneratedProfile] = useState<GeneratedProfile | null>(null)

  // ─── Phase transitions ───────────────────────────────────────────

  async function goToSectors() {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/onboarding/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, country }),
      })
      const data = await res.json()
      if (data.sectors) {
        setAvailableSectors(data.sectors)
        setPhase('sectors')
      } else {
        setError('Failed to generate suggestions. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  async function goToSubsectors() {
    if (selectedSectorIds.size === 0) return
    setLoading(true)
    setError(null)
    const sectors = availableSectors
      .filter(s => selectedSectorIds.has(s.id))
      .map(s => s.label)

    try {
      const res = await fetch('/api/ai/onboarding/sectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, country, selectedSectors: sectors }),
      })
      const data = await res.json()
      if (data.sectors) {
        setAvailableSubsectors(data.sectors)
        setPhase('subsectors')
      }
    } catch {
      setError('Failed to load. Please try again.')
    }
    setLoading(false)
  }

  async function goToBuyers() {
    setLoading(true)
    setError(null)
    const sectors = availableSectors.filter(s => selectedSectorIds.has(s.id)).map(s => s.label)
    const subsectors = availableSubsectors.filter(s => selectedSubsectorIds.has(s.id)).map(s => s.label)

    try {
      const res = await fetch('/api/ai/onboarding/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          country,
          sectors,
          subsectors,
          countries: [...selectedCountries],
        }),
      })
      const data = await res.json()
      if (data.buyers) {
        setAvailableBuyers(data.buyers)
        setPhase('buyers')
      } else {
        setError('Failed to suggest buyers. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    }
    setLoading(false)
  }

  async function goToTenders() {
    setLoading(true)
    setError(null)
    const sectors = availableSectors.filter(s => selectedSectorIds.has(s.id)).map(s => s.label)
    const subsectors = availableSubsectors.filter(s => selectedSubsectorIds.has(s.id)).map(s => s.label)
    const selectedBuyers = availableBuyers.filter(b => selectedBuyerIds.has(b.id))

    try {
      const res = await fetch('/api/ai/onboarding/example-tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          sectors,
          subsectors,
          countries: [...selectedCountries],
          buyers: selectedBuyers,
        }),
      })
      const data = await res.json()
      if (data.tenders && data.tenders.length > 0) {
        setExampleTenders(data.tenders)
        setPhase('tenders')
      } else {
        setError('No example tenders found. Try broadening your selections.')
      }
    } catch {
      setError('Failed to fetch tenders. Please try again.')
    }
    setLoading(false)
  }

  async function goToGenerateProfile() {
    setPhase('generating')
    setError(null)

    const sectors = availableSectors.filter(s => selectedSectorIds.has(s.id)).map(s => s.label)
    const subsectors = availableSubsectors.filter(s => selectedSubsectorIds.has(s.id)).map(s => s.label)
    const liked = exampleTenders.filter(t => likedIds.has(t.id))
    const disliked = exampleTenders.filter(t => dislikedIds.has(t.id))
    const selectedBuyers = availableBuyers.filter(b => selectedBuyerIds.has(b.id))

    const vr = VALUE_RANGES.find(v => v.id === valueRange)

    try {
      const res = await fetch('/api/ai/onboarding/generate-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          companyCountry: country,
          sectors,
          subsectors,
          selectedCountries: [...selectedCountries],
          valueRange: vr?.range ? `${vr.range[0] || 0}-${vr.range[1] || 'unlimited'}` : null,
          likedTenders: liked,
          dislikedTenders: disliked,
          preferredBuyers: selectedBuyers.map(b => b.name),
        }),
      })
      const data = await res.json()
      if (data.profile) {
        setGeneratedProfile(data.profile)
        setPhase('review')
      } else {
        setError('Failed to generate profile. Please try again.')
        setPhase('tenders')
      }
    } catch {
      setError('Network error. Please try again.')
      setPhase('tenders')
    }
  }

  async function saveProfile() {
    if (!generatedProfile) return
    setLoading(true)

    if (isPublic) {
      // Store profile in sessionStorage so we can save it after signup
      const profileData = {
        companyName,
        country,
        profile: generatedProfile,
        valueRange,
      }
      sessionStorage.setItem('tenderwatch_pending_profile', JSON.stringify(profileData))
      setLoading(false)
      setPhase('done')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('companies').insert({
      user_id: user.id,
      name: companyName || description.slice(0, 50),
      country_code: country,
    })

    await supabase.from('subscriptions').insert({
      user_id: user.id,
      plan: 'professional',
      status: 'active',
    })

    const vr = VALUE_RANGES.find(v => v.id === valueRange)

    await supabase.from('monitoring_profiles').insert({
      user_id: user.id,
      name: generatedProfile.profile_name || `${companyName} profile`,
      cpv_codes: generatedProfile.cpv_codes,
      keywords: generatedProfile.keywords,
      exclude_keywords: generatedProfile.exclude_keywords,
      countries: generatedProfile.countries,
      min_value_eur: generatedProfile.min_value_eur ?? (vr?.range?.[0] ?? null),
      max_value_eur: generatedProfile.max_value_eur ?? (vr?.range?.[1] ?? null),
    })

    setLoading(false)
    setPhase('done')
  }

  // ─── Toggle helpers ──────────────────────────────────────────────

  function toggleSet(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  function toggleLike(id: string) {
    const next = new Set(likedIds)
    const nextDisliked = new Set(dislikedIds)
    if (next.has(id)) { next.delete(id) } else { next.add(id); nextDisliked.delete(id) }
    setLikedIds(next)
    setDislikedIds(nextDisliked)
  }

  function toggleDislike(id: string) {
    const next = new Set(dislikedIds)
    const nextLiked = new Set(likedIds)
    if (next.has(id)) { next.delete(id) } else { next.add(id); nextLiked.delete(id) }
    setDislikedIds(next)
    setLikedIds(nextLiked)
  }

  // ─── Progress bar ────────────────────────────────────────────────

  const phases: Phase[] = ['basics', 'sectors', 'subsectors', 'buyers', 'tenders', 'generating', 'review', 'done']
  const phaseIndex = phases.indexOf(phase)

  // ─── Render ──────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-1.5 mb-8">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-colors ${i <= phaseIndex ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Phase: Basics ── */}
      {phase === 'basics' && (
        <div>
          <AiMessage>
            <p className="font-medium">Welcome to TenderWatch!</p>
            <p className="mt-1">Tell me a bit about your company and I&apos;ll help you find the right public tenders.</p>
          </AiMessage>

          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Company name</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Your company name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Country</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {COUNTRIES.slice(0, 8).map(c => (
                  <ChoiceChip
                    key={c.code}
                    label={c.name}
                    emoji={c.flag}
                    selected={country === c.code}
                    onClick={() => setCountry(c.code)}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                What does your company do? <span className="text-gray-400">(1-2 sentences)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="We provide maritime engineering consultancy specializing in ship design and naval architecture..."
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={goToSectors}
              disabled={!description.trim() || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {loading ? 'Analyzing...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Sectors ── */}
      {phase === 'sectors' && (
        <div>
          <AiMessage>
            <p>Based on your description, I think you&apos;d be interested in these areas. <strong>Click all that apply:</strong></p>
          </AiMessage>

          <div className="flex flex-wrap gap-2 mt-2">
            {availableSectors.map(s => (
              <ChoiceChip
                key={s.id}
                label={s.label}
                emoji={s.emoji}
                selected={selectedSectorIds.has(s.id)}
                onClick={() => setSelectedSectorIds(toggleSet(selectedSectorIds, s.id))}
              />
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setPhase('basics')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={goToSubsectors}
              disabled={selectedSectorIds.size === 0 || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              {loading ? 'Thinking...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Subsectors + Country + Value ── */}
      {phase === 'subsectors' && (
        <div>
          <AiMessage>
            <p>Great choices! Let me get more specific. <strong>Which of these apply?</strong></p>
          </AiMessage>

          <div className="flex flex-wrap gap-2 mt-2">
            {availableSubsectors.map(s => (
              <ChoiceChip
                key={s.id}
                label={s.label}
                emoji={s.emoji}
                selected={selectedSubsectorIds.has(s.id)}
                onClick={() => setSelectedSubsectorIds(toggleSet(selectedSubsectorIds, s.id))}
              />
            ))}
          </div>

          <div className="mt-6">
            <AiMessage>
              <p>Which countries should I search in?</p>
            </AiMessage>
            <div className="flex flex-wrap gap-2 mt-2">
              {COUNTRIES.map(c => (
                <ChoiceChip
                  key={c.code}
                  label={c.name}
                  emoji={c.flag}
                  selected={selectedCountries.has(c.code)}
                  onClick={() => setSelectedCountries(toggleSet(selectedCountries, c.code))}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <AiMessage>
              <p>What contract size are you typically going for?</p>
            </AiMessage>
            <div className="flex flex-wrap gap-2 mt-2">
              {VALUE_RANGES.map(v => (
                <ChoiceChip
                  key={v.id}
                  label={v.label}
                  selected={valueRange === v.id}
                  onClick={() => setValueRange(v.id)}
                />
              ))}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setPhase('sectors')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={goToBuyers}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              {loading ? 'Finding buyers...' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Buyers ── */}
      {phase === 'buyers' && (
        <div>
          <AiMessage>
            <p>Which public organizations would you like to monitor? <strong>Select the ones you&apos;d bid on tenders from:</strong></p>
          </AiMessage>

          <div className="flex flex-wrap gap-2 mt-2">
            {availableBuyers.map(b => (
              <ChoiceChip
                key={b.id}
                label={`${b.label} (${b.country})`}
                selected={selectedBuyerIds.has(b.id)}
                onClick={() => setSelectedBuyerIds(toggleSet(selectedBuyerIds, b.id))}
              />
            ))}
          </div>

          <div className="mt-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={customBuyer}
                onChange={(e) => setCustomBuyer(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Add a specific organization name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customBuyer.trim()) {
                    const id = `custom-${Date.now()}`
                    setAvailableBuyers(prev => [...prev, { id, name: customBuyer.trim(), label: customBuyer.trim(), country: country }])
                    setSelectedBuyerIds(prev => { const next = new Set(prev); next.add(id); return next })
                    setCustomBuyer('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (customBuyer.trim()) {
                    const id = `custom-${Date.now()}`
                    setAvailableBuyers(prev => [...prev, { id, name: customBuyer.trim(), label: customBuyer.trim(), country: country }])
                    setSelectedBuyerIds(prev => { const next = new Set(prev); next.add(id); return next })
                    setCustomBuyer('')
                  }
                }}
                disabled={!customBuyer.trim()}
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">Know a specific organization? Type its name and press Enter.</p>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setPhase('subsectors')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={goToTenders}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                {loading ? 'Searching TED...' : `Show me tenders${selectedBuyerIds.size > 0 ? ` (${selectedBuyerIds.size} buyers)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Phase: Tender swiping ── */}
      {phase === 'tenders' && (
        <div>
          <AiMessage>
            <p>Here are real tenders from the EU. <strong>Tell me which ones you&apos;d want to see in your feed</strong> — this helps me understand your preferences.</p>
          </AiMessage>

          <div className="space-y-3 mt-2">
            {exampleTenders.map(t => (
              <TenderExampleCard
                key={t.id}
                tender={t}
                liked={likedIds.has(t.id)}
                disliked={dislikedIds.has(t.id)}
                onLike={() => toggleLike(t.id)}
                onDislike={() => toggleDislike(t.id)}
              />
            ))}
          </div>

          <div className="mt-4 text-center text-xs text-gray-400">
            {likedIds.size} liked · {dislikedIds.size} disliked · {exampleTenders.length - likedIds.size - dislikedIds.size} not rated
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button onClick={() => setPhase('buyers')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={goToGenerateProfile}
              disabled={likedIds.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Target className="h-4 w-4" />
              Build my profile ({likedIds.size} liked)
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Generating ── */}
      {phase === 'generating' && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
            <Sparkles className="h-8 w-8 text-blue-600 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Building your profile...</h2>
          <p className="text-sm text-gray-500 mt-2">
            Analyzing your preferences and the tenders you liked to create the perfect monitoring profile.
          </p>
          <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto mt-4" />
        </div>
      )}

      {/* ── Phase: Review ── */}
      {phase === 'review' && generatedProfile && (
        <div>
          <AiMessage>
            <p>Here&apos;s what I&apos;ve put together. You can tweak anything before we save it.</p>
            {generatedProfile.reasoning && (
              <p className="mt-1 text-gray-500 italic">{generatedProfile.reasoning}</p>
            )}
          </AiMessage>

          <div className="mt-4 space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Profile name</h3>
              <p className="text-sm text-gray-700">{generatedProfile.profile_name}</p>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">CPV codes ({generatedProfile.cpv_codes.length})</h3>
              <div className="flex flex-wrap gap-1.5">
                {generatedProfile.cpv_codes.map(c => (
                  <span key={c} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{c}</span>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-1.5">
                {generatedProfile.keywords.map(k => (
                  <span key={k} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">{k}</span>
                ))}
              </div>
            </div>

            {generatedProfile.exclude_keywords.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Exclude keywords</h3>
                <div className="flex flex-wrap gap-1.5">
                  {generatedProfile.exclude_keywords.map(k => (
                    <span key={k} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-full">{k}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Countries</h3>
              <div className="flex flex-wrap gap-1.5">
                {generatedProfile.countries.map(c => {
                  const info = COUNTRIES.find(x => x.code === c)
                  return (
                    <span key={c} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                      {info?.flag} {info?.name || c}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between">
            <button onClick={() => setPhase('tenders')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-4 w-4" /> Back to tenders
            </button>
            <button
              onClick={saveProfile}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {loading ? 'Saving...' : 'Looks good, save it!'}
            </button>
          </div>
        </div>
      )}

      {/* ── Phase: Done ── */}
      {phase === 'done' && (
        <div>
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              {isPublic ? 'Your profile is ready!' : 'Profile created!'}
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              {isPublic
                ? 'Sign up to activate your profile and start receiving matched tenders in your inbox every morning.'
                : 'Your daily feed will update every morning. You can also backfill historical tenders now:'}
            </p>
          </div>

          {isPublic ? (
            <div className="space-y-4">
              {generatedProfile && (
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                  <p className="font-medium text-gray-900 mb-2">Your profile: {generatedProfile.profile_name}</p>
                  <p>{generatedProfile.cpv_codes.length} CPV codes, {generatedProfile.keywords.length} keywords, {generatedProfile.countries.length} countries</p>
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <a
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Create account — activate my profile
                  <ArrowRight className="h-4 w-4" />
                </a>
                <p className="text-xs text-gray-400">Free to start. Your profile will be saved automatically.</p>
              </div>
            </div>
          ) : (
            <>
              <BackfillButton />
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => router.push('/feed')}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Go to my feed
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
