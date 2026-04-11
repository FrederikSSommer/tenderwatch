import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OnboardingWizardV2 } from '@/components/OnboardingWizardV2'
import { ProfileEditor } from '@/components/ProfileEditor'
import Link from 'next/link'
import { Settings2, Sparkles } from 'lucide-react'

export default async function NewProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>
}) {
  const params = await searchParams
  const useManual = params.mode === 'manual'

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: company } = await supabase
    .from('companies')
    .select('name, country_code')
    .eq('user_id', user.id)
    .maybeSingle()

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {useManual ? 'Create monitoring profile' : 'New profile — guided'}
        </h1>
        <Link
          href={useManual ? '/profiles/new' : '/profiles/new?mode=manual'}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {useManual ? (
            <>
              <Sparkles className="h-4 w-4 text-blue-600" />
              Use AI wizard
            </>
          ) : (
            <>
              <Settings2 className="h-4 w-4" />
              Switch to manual
            </>
          )}
        </Link>
      </div>

      {useManual ? (
        <ProfileEditor />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-2xl">
          <OnboardingWizardV2
            mode="profile"
            existingCompanyName={company?.name ?? undefined}
            existingCompanyCountry={company?.country_code ?? undefined}
          />
        </div>
      )}
    </div>
  )
}
