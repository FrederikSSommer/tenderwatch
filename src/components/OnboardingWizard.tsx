'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { KeywordInput } from './KeywordInput'
import { Loader2, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'

const COUNTRIES = [
  { code: 'DK', name: 'Denmark' },
  { code: 'NO', name: 'Norway' },
  { code: 'SE', name: 'Sweden' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'UK', name: 'United Kingdom' },
]

export function OnboardingWizard() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)

  const [companyName, setCompanyName] = useState('')
  const [description, setDescription] = useState('')
  const [country, setCountry] = useState('DK')

  const [suggestedCpv, setSuggestedCpv] = useState<string[]>([])
  const [selectedCpv, setSelectedCpv] = useState<string[]>([])
  const [suggestingCpv, setSuggestingCpv] = useState(false)

  const [keywords, setKeywords] = useState<string[]>([])
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>(['DK'])

  const [minValue, setMinValue] = useState('')
  const [maxValue, setMaxValue] = useState('')

  async function suggestCpvCodes() {
    setSuggestingCpv(true)
    try {
      const response = await fetch('/api/ai/suggest-cpv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await response.json()
      if (data.codes) {
        setSuggestedCpv(data.codes)
        setSelectedCpv(data.codes.slice(0, 5))
      }
    } catch (err) {
      console.error('Failed to suggest CPV codes:', err)
    }
    setSuggestingCpv(false)
  }

  async function handleComplete() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('companies').insert({
      user_id: user.id,
      name: companyName,
      country_code: country,
    })

    // TODO: Change to 'free' when Stripe is connected
    await supabase.from('subscriptions').insert({
      user_id: user.id,
      plan: 'professional',
      status: 'active',
    })

    await supabase.from('monitoring_profiles').insert({
      user_id: user.id,
      name: companyName ? `${companyName} profile` : 'My profile',
      cpv_codes: selectedCpv,
      keywords,
      exclude_keywords: excludeKeywords,
      countries,
      min_value_eur: minValue ? parseFloat(minValue) : null,
      max_value_eur: maxValue ? parseFloat(maxValue) : null,
    })

    setLoading(false)
    router.push('/feed')
  }

  function nextStep() {
    if (step === 1 && description) {
      suggestCpvCodes()
    }
    setStep(s => Math.min(s + 1, 4))
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1.5 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Tell us about your business</h2>
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
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Describe what your company does (1-2 sentences)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="We are a maritime engineering consultancy specializing in ship design..."
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Suggested categories</h2>
          <p className="text-sm text-gray-600">Based on your description, we suggest these CPV categories:</p>
          {suggestingCpv ? (
            <div className="flex items-center gap-2 py-8 justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm text-gray-600">AI is analyzing your business...</span>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestedCpv.map((code) => (
                <label key={code} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedCpv.includes(code)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCpv([...selectedCpv, code])
                      } else {
                        setSelectedCpv(selectedCpv.filter(c => c !== code))
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-900">{code}</span>
                </label>
              ))}
              <KeywordInput
                values={selectedCpv.filter(c => !suggestedCpv.includes(c))}
                onChange={(extra) => setSelectedCpv([...suggestedCpv.filter(c => selectedCpv.includes(c)), ...extra])}
                placeholder="Add more CPV codes manually"
              />
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Keywords and geography</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional keywords</label>
            <KeywordInput values={keywords} onChange={setKeywords} placeholder="e.g. maritime, naval, ship design" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Exclude keywords</label>
            <KeywordInput values={excludeKeywords} onChange={setExcludeKeywords} placeholder="e.g. cleaning, catering" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Countries</label>
            <div className="grid grid-cols-2 gap-2">
              {COUNTRIES.map((c) => (
                <label key={c.code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={countries.includes(c.code)}
                    onChange={() => {
                      setCountries(prev =>
                        prev.includes(c.code) ? prev.filter(cc => cc !== c.code) : [...prev, c.code]
                      )
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Contract value range</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Minimum (EUR)</label>
              <input
                type="number"
                value={minValue}
                onChange={(e) => setMinValue(e.target.value)}
                placeholder="No minimum"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Maximum (EUR)</label>
              <input
                type="number"
                value={maxValue}
                onChange={(e) => setMaxValue(e.target.value)}
                placeholder="No maximum"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        {step > 1 ? (
          <button
            onClick={() => setStep(s => s - 1)}
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <div />
        )}
        {step < 4 ? (
          <button
            onClick={nextStep}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleComplete}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Create my profile
          </button>
        )}
      </div>
    </div>
  )
}
