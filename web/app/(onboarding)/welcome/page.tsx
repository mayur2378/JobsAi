import Link from 'next/link'

export default function OnboardingWelcomePage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#0a0a0f' }}
    >
      <div
        className="max-w-md w-full rounded-2xl p-8 text-center space-y-4"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
      >
        <div className="text-4xl">🎉</div>
        <h1 className="text-xl font-extrabold text-slate-100">Account created!</h1>
        <p className="text-slate-400 text-sm">
          Onboarding wizard comes in Plan 2. For now, head to the dashboard.
        </p>
        <Link
          href="/dashboard"
          className="inline-block w-full py-2.5 rounded-lg text-white text-sm font-semibold text-center hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          Go to Dashboard →
        </Link>
      </div>
    </div>
  )
}
