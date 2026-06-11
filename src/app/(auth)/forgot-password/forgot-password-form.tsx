'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const supabase = createClient()

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // The recovery email link lands on /auth/callback, which exchanges the
    // code for a session and forwards to /auth/reset-password where the user
    // sets a new password. Works even for accounts that never had a password
    // (e.g. legacy OTP / magic-link sign-ups).
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
          If an account exists for <span className="font-semibold">{email}</span>, we&apos;ve
          sent a link to set a new password. Check your inbox.
        </div>
        <p className="text-center text-sm text-gray-600">
          <a href="/login" className="font-semibold text-blue-600 hover:text-blue-500">
            Back to sign in
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleReset} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@company.dk"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send reset link
        </button>
      </form>

      <p className="text-center text-sm text-gray-600">
        Remembered it?{' '}
        <a href="/login" className="font-semibold text-blue-600 hover:text-blue-500">
          Back to sign in
        </a>
      </p>
    </div>
  )
}
