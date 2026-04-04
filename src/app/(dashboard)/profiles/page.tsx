import { createServerSupabaseClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Target, Plus } from 'lucide-react'

export default async function ProfilesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profiles } = await supabase
    .from('monitoring_profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">Define what tenders you want to monitor</p>
        </div>
        <Link
          href="/dashboard/profiles/new"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New profile
        </Link>
      </div>

      {profiles && profiles.length > 0 ? (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <Link
              key={profile.id}
              href={`/dashboard/profiles/${profile.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Target className="h-5 w-5 text-blue-600" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{profile.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {profile.cpv_codes.length} CPV codes
                      {profile.keywords.length > 0 && ` · ${profile.keywords.length} keywords`}
                      {` · ${profile.countries.join(', ')}`}
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                  profile.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {profile.active ? 'Active' : 'Paused'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Target className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No profiles yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            Create a monitoring profile to start receiving matched tenders.
          </p>
          <Link
            href="/dashboard/profiles/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create your first profile
          </Link>
        </div>
      )}
    </div>
  )
}
