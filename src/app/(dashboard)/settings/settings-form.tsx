'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BackfillButton } from '@/components/BackfillButton'
import { Mail, Bell, BellOff, Save, Loader2 } from 'lucide-react'

interface SettingsFormProps {
  email: string
  company: { id: string; name: string; industry: string | null; country_code: string } | null
  subscription: {
    id: string
    plan: string
    status: string
    current_period_end: string | null
    email_frequency?: string
  } | null
  profileCount: number
}

const FREQUENCY_OPTIONS = [
  {
    value: 'daily',
    label: 'Daily digest',
    description: 'Receive an email every morning with new matched tenders',
    icon: Mail,
  },
  {
    value: 'weekly',
    label: 'Weekly digest',
    description: 'Receive one email per week (Monday) with all new matches',
    icon: Bell,
  },
  {
    value: 'off',
    label: 'Emails off',
    description: 'No email notifications — check the feed manually',
    icon: BellOff,
  },
]

export function SettingsForm({ email, company, subscription, profileCount }: SettingsFormProps) {
  const supabase = createClient()
  const [companyName, setCompanyName] = useState(company?.name ?? '')
  const [emailFrequency, setEmailFrequency] = useState(subscription?.email_frequency ?? 'daily')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)

    if (company) {
      await supabase.from('companies').update({ name: companyName }).eq('id', company.id)
    }

    if (subscription) {
      await supabase
        .from('subscriptions')
        .update({ email_frequency: emailFrequency as 'daily' | 'weekly' | 'off' })
        .eq('id', subscription.id)
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const plan = subscription?.plan ?? 'free'

  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Account</h2>
        <div className="space-y-4 bg-white rounded-lg border border-gray-200 p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-900">{email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Company name</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Email notifications</h2>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-4">
            Choose how often you want to receive email digests with new matched tenders.
            {profileCount > 0 && (
              <span className="text-gray-400"> You have {profileCount} active monitoring profile{profileCount !== 1 ? 's' : ''}.</span>
            )}
          </p>

          <div className="space-y-3">
            {FREQUENCY_OPTIONS.map((opt) => {
              const Icon = opt.icon
              const isSelected = emailFrequency === opt.value
              return (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="email_frequency"
                    value={opt.value}
                    checked={isSelected}
                    onChange={() => setEmailFrequency(opt.value)}
                    className="mt-0.5 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                        {opt.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 ml-6">{opt.description}</p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving...' : 'Save changes'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Saved!</span>
        )}
      </div>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Historical tenders</h2>
        <BackfillButton />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan</h2>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="font-medium text-gray-900 capitalize">{plan} plan</p>
          <p className="text-sm text-gray-500 mt-1">
            All features unlocked during prototype phase.
          </p>
        </div>
      </section>
    </div>
  )
}
