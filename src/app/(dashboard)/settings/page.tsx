import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SettingsForm } from './settings-form'

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id)
    .single()

  const { count: profileCount } = await supabase
    .from('monitoring_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('active', true)

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <SettingsForm
        email={user.email!}
        company={company}
        subscription={subscription}
        profileCount={profileCount ?? 0}
      />
    </div>
  )
}
