import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from './reset-password-form'

// The user reaches this page from a recovery email (via /auth/callback, which
// exchanges the code for a session). They must have an active session here to
// set a new password — without one, the link was invalid or has expired.
export default async function ResetPasswordPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">TenderWatch</h1>
          <p className="mt-2 text-gray-600">Choose a new password</p>
        </div>
        {user ? (
          <ResetPasswordForm />
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
              This reset link is invalid or has expired. Request a new one to continue.
            </div>
            <p className="text-center text-sm text-gray-600">
              <a
                href="/forgot-password"
                className="font-semibold text-blue-600 hover:text-blue-500"
              >
                Request a new link
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
