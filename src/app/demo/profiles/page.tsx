import { DEMO_PROFILES } from '@/lib/demo-data'
import Link from 'next/link'
import { Target, Plus } from 'lucide-react'

export default function DemoProfilesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Monitoring Profiles</h1>
          <p className="text-sm text-gray-500 mt-1">Define what tenders you want to monitor</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" />
          New profile
        </button>
      </div>

      <div className="space-y-3">
        {DEMO_PROFILES.map((profile) => (
          <div
            key={profile.id}
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
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {profile.keywords.map(kw => (
                      <span key={kw} className="text-xs rounded bg-blue-50 text-blue-700 px-1.5 py-0.5">{kw}</span>
                    ))}
                  </div>
                </div>
              </div>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-green-100 text-green-700">
                Active
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
