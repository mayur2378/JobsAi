import Link from 'next/link'

export default function OnboardingWelcomePage() {
  return (
    <div
      className="max-w-md w-full mx-auto rounded-2xl p-10 text-center space-y-6"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div className="text-5xl">🚀</div>
      <div>
        <h1 className="text-2xl font-extrabold text-slate-100 mb-2">Welcome to JobTrack AI</h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          Let&apos;s get you set up in under 2 minutes. We&apos;ll collect your profile, parse your
          resume with AI, and build your skills list so we can match you to the right jobs.
        </p>
      </div>
      <div className="space-y-2 text-left text-sm text-slate-500">
        {['Your profile & preferences', 'Upload your resume (AI-parsed)', 'Confirm your skills'].map(
          (step, i) => (
            <div key={step} className="flex items-center gap-3">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </div>
          )
        )}
      </div>
      <Link
        href="/onboarding/profile"
        className="inline-block w-full py-3 rounded-xl text-white text-sm font-semibold text-center hover:opacity-90 transition"
        style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
      >
        Get started →
      </Link>
    </div>
  )
}
