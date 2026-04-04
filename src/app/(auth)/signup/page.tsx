import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SignupForm } from './signup-form'

export default async function SignupPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard/feed')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">TenderWatch</h1>
          <p className="mt-2 text-gray-600">Create your free account</p>
          <p className="mt-1 text-sm text-gray-500">Start finding relevant tenders in under 3 minutes</p>
        </div>
        <SignupForm />
      </div>
    </div>
  )
}
