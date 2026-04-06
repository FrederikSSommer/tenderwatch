import { OnboardingWizardV2 } from '@/components/OnboardingWizardV2'
import Link from 'next/link'

export default function TryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-100 bg-white">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">TenderWatch</Link>
          <div className="flex items-center gap-4">
            <a href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</a>
            <a
              href="/signup"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Start free
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto py-12 px-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <OnboardingWizardV2 isPublic />
        </div>
      </div>
    </div>
  )
}
