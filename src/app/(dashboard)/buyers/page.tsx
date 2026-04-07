import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Building2 } from 'lucide-react'
import { FollowedBuyersList } from '@/components/FollowedBuyersList'

export default async function BuyersPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: buyers } = await supabase
    .from('followed_buyers')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Followed Buyers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track contracting authorities and get notified when they publish new tenders
          </p>
        </div>
      </div>

      <FollowedBuyersList initialBuyers={buyers || []} />
    </div>
  )
}
