import { ProfileEditor } from '@/components/ProfileEditor'

export default function NewProfilePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create monitoring profile</h1>
      <ProfileEditor />
    </div>
  )
}
