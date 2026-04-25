'use client'

import { usePathname } from 'next/navigation'
import { StepIndicator } from './StepIndicator'

const STEPS = [
  { path: '/onboarding/welcome', label: 'Welcome' },
  { path: '/onboarding/profile', label: 'Profile' },
  { path: '/onboarding/resume', label: 'Resume' },
  { path: '/onboarding/skills', label: 'Skills' },
]

export function OnboardingContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const currentStep = Math.max(
    STEPS.findIndex((s) => pathname.startsWith(s.path)),
    0
  )

  return (
    <div
      className="min-h-screen"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0a0f 60%)' }}
    >
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Brand header */}
        <div className="text-center mb-6">
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            JobTrack AI
          </h1>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        {/* Page content */}
        {children}
      </div>
    </div>
  )
}
