'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { KeywordInput } from './KeywordInput'
import { Loader2, Save, Trash2 } from 'lucide-react'

interface ProfileEditorProps {
  profile?: {
    id: string
    name: string
    cpv_codes: string[]
    keywords: string[]
    exclude_keywords: string[]
    countries: string[]
    min_value_eur: number | null
    max_value_eur: number | null
    active: boolean
    notify_email: boolean
    notify_push: boolean
  }
}

const EU_COUNTRIES = [
  { code: 'DK', name: 'Denmark' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PL', name: 'Poland' },
  { code: 'BE', name: 'Belgium' },
  { code: 'AT', name: 'Austria' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IE', name: 'Ireland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'HR', name: 'Croatia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LV', name: 'Latvia' },
  { code: 'EE', name: 'Estonia' },
]

export function ProfileEditor({ profile }: ProfileEditorProps) {
  const isNew = !profile
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(profile?.name ?? 'My profile')
  const [cpvCodes, setCpvCodes] = useState<string[]>(profile?.cpv_codes ?? [])
  const [keywords, setKeywords] = useState<string[]>(profile?.keywords ?? [])
  const [excludeKeywords, setExcludeKeywords] = useState<string[]>(profile?.exclude_keywords ?? [])
  const [countries, setCountries] = useState<string[]>(profile?.countries ?? ['DK'])
  const [minValue, setMinValue] = useState<string>(profile?.min_value_eur?.toString() ?? '')
  const [maxValue, setMaxValue] = useState<string>(profile?.max_value_eur?.toString() ?? '')
  const [notifyEmail, setNotifyEmail] = useState(profile?.notify_email ?? true)
  const [active, setActive] = useState(profile?.active ?? true)

  async function handleSave() {
    setLoading(true)
    const data = {
      name,
      cpv_codes: cpvCodes,
      keywords,
      exclude_keywords: excludeKeywords,
      countries,
      min_value_eur: minValue ? parseFloat(minValue) : null,
      max_value_eur: maxValue ? parseFloat(maxValue) : null,
      notify_email: notifyEmail,
      active,
    }

    if (isNew) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('monitoring_profiles').insert({ ...data, user_id: user.id })
    } else {
      await supabase.from('monitoring_profiles').update(data).eq('id', profile.id)
    }
    setLoading(false)
    router.push('/profiles')
    router.refresh()
  }

  async function handleDelete() {
    if (!profile || !confirm('Delete this profile?')) return
    await supabase.from('monitoring_profiles').delete().eq('id', profile.id)
    router.push('/profiles')
    router.refresh()
  }

  function toggleCountry(code: string) {
    setCountries(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700">Profile name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">CPV Codes</label>
        <KeywordInput
          values={cpvCodes}
          onChange={setCpvCodes}
          placeholder="Type CPV code (e.g. 71300000) and press Enter"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Keywords</label>
        <KeywordInput
          values={keywords}
          onChange={setKeywords}
          placeholder="Type keyword and press Enter"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Exclude keywords</label>
        <KeywordInput
          values={excludeKeywords}
          onChange={setExcludeKeywords}
          placeholder="Type keyword to exclude and press Enter"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Countries</label>
        <div className="grid grid-cols-3 gap-2">
          {EU_COUNTRIES.map((c) => (
            <label key={c.code} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={countries.includes(c.code)}
                onChange={() => toggleCountry(c.code)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {c.name}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Min value (EUR)</label>
          <input
            type="number"
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
            placeholder="No minimum"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Max value (EUR)</label>
          <input
            type="number"
            value={maxValue}
            onChange={(e) => setMaxValue(e.target.value)}
            placeholder="No maximum"
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Send daily email digest
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Profile active
        </label>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t">
        <button
          onClick={handleSave}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isNew ? 'Create profile' : 'Save changes'}
        </button>
        {!isNew && (
          <button
            onClick={handleDelete}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
