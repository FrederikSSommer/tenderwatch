import { createServerSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ProfileEditor } from '@/components/ProfileEditor'
import type { Tables } from '@/lib/supabase/types'

export default async function EditProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('monitoring_profiles')
    .select('*')
    .eq('id', id)
    .single()

  const profile = data as Tables<'monitoring_profiles'> | null
  if (!profile) notFound()

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit profile: {profile.name}</h1>
      <ProfileEditor profile={profile} />
    </div>
  )
}
