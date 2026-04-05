'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BackfillButton } from '@/components/BackfillButton'

interface SettingsFormProps {
  email: string
  company: { id: string; name: string; industry: string | null; country_code: string } | null
  subscription: { plan: string; status: string; current_period_end: string | null } | null
}

export function SettingsForm({ email, company, subscription }: SettingsFormProps) {
  const supabase = createClient()
  const [companyName, setCompanyName] = useState(company?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    if (company) {
      await supabase.from('companies').update({ name: companyName }).eq('id', company.id)
    }
    setSaving(false)
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
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </section>

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
