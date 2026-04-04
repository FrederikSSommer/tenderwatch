import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardSidebar } from '@/components/DashboardSidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan')
    .eq('user_id', user.id)
    .single()

  const plan = subscription?.plan ?? 'free'

  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar userEmail={user.email!} plan={plan} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
