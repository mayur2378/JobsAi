import { ProfileForm } from '@/components/profile/ProfileForm'

export default function OnboardingProfilePage() {
  return (
    <div
      className="rounded-2xl p-8"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <h2 className="text-xl font-extrabold text-slate-100 mb-1">Tell us about yourself</h2>
      <p className="text-slate-500 text-sm mb-6">This helps us match you to the right roles.</p>
      <ProfileForm />
    </div>
  )
}
