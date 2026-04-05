import { OnboardingWizardV2 } from '@/components/OnboardingWizardV2'

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <OnboardingWizardV2 />
        </div>
      </div>
    </div>
  )
}
