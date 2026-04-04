import { OnboardingWizard } from '@/components/OnboardingWizard'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to TenderWatch</h1>
          <p className="mt-2 text-gray-600">Let&apos;s set up your first monitoring profile</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <OnboardingWizard />
        </div>
      </div>
    </div>
  )
}
