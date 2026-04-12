'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Sparkles } from 'lucide-react'

const VALUE_RANGES: Record<string, [number | null, number | null]> = {
  small: [null, 500000],
  medium: [500000, 2000000],
  large: [2000000, 10000000],
  xlarge: [10000000, null],
}

/**
 * Checks sessionStorage for a profile saved during the public /try wizard.
 * If found, auto-saves it to the database and redirects to /feed.
 * Returns null (renders nothing) while checking, or if no pending profile exists.
 */
export function PendingProfileLoader({
  onNoPending,
}: {
  onNoPending: () => void
}) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function restorePendingProfile() {
      const raw = sessionStorage.getItem('tenderwatch_pending_profile')
      if (!raw) {
        setSaving(false)
        onNoPending()
        return
      }

      let pending: {
        companyName: string
        country: string
        description?: string
        profile: {
          cpv_codes: string[]
          keywords: string[]
          exclude_keywords: string[]
          countries: string[]
          min_value_eur: number | null
          max_value_eur: number | null
          profile_name: string
          reasoning: string
        }
        valueRange: string
      }

      try {
        pending = JSON.parse(raw)
      } catch {
        sessionStorage.removeItem('tenderwatch_pending_profile')
        setSaving(false)
        onNoPending()
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setSaving(false)
        onNoPending()
        return
      }

      try {
        // Create company
        const { data: existingCompany } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (existingCompany) {
          await supabase.from('companies')
            .update({ name: pending.companyName || 'My company', country_code: pending.country })
            .eq('id', existingCompany.id)
        } else {
          await supabase.from('companies').insert({
            user_id: user.id,
            name: pending.companyName || 'My company',
            country_code: pending.country,
          })
        }

        // Create subscription
        const { data: existingSub } = await supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!existingSub) {
          await supabase.from('subscriptions').insert({
            user_id: user.id,
            plan: 'professional',
            status: 'active',
          })
        }

        // Create monitoring profile
        const vr = VALUE_RANGES[pending.valueRange] ?? [null, null]
        await supabase.from('monitoring_profiles').insert({
          user_id: user.id,
          name: pending.profile.profile_name || `${pending.companyName} profile`,
          description: pending.description || null,
          cpv_codes: pending.profile.cpv_codes,
          keywords: pending.profile.keywords,
          exclude_keywords: pending.profile.exclude_keywords,
          countries: pending.profile.countries,
          min_value_eur: pending.profile.min_value_eur ?? vr[0],
          max_value_eur: pending.profile.max_value_eur ?? vr[1],
        })

        // Clear the pending data
        sessionStorage.removeItem('tenderwatch_pending_profile')

        // Redirect to feed
        router.push('/feed')
        router.refresh()
      } catch (err) {
        console.error('Failed to restore pending profile:', err)
        setError('Failed to save your profile. Please try again.')
        sessionStorage.removeItem('tenderwatch_pending_profile')
        setSaving(false)
      }
    }

    restorePendingProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => { setSaving(false); onNoPending() }}
          className="text-sm text-blue-600 hover:underline"
        >
          Start fresh
        </button>
      </div>
    )
  }

  if (!saving) return null

  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
        <Sparkles className="h-8 w-8 text-blue-600 animate-pulse" />
      </div>
      <h2 className="text-xl font-bold text-gray-900">Setting up your profile...</h2>
      <p className="text-sm text-gray-500 mt-2">
        Saving the profile you created. Just a moment.
      </p>
      <Loader2 className="h-5 w-5 animate-spin text-blue-600 mx-auto mt-4" />
    </div>
  )
}
