'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SkillsManager } from '@/components/skills/SkillsManager'
import { apiFetch } from '@/lib/api'

export default function OnboardingSkillsPage() {
  const router = useRouter()
  const [skillCount, setSkillCount] = useState(0)
  const [isCompleting, setIsCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function completeOnboarding() {
    setIsCompleting(true)
    setError(null)
    try {
      await apiFetch('/profile/onboarding', { method: 'POST' })
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding')
    } finally {
      setIsCompleting(false)
    }
  }

  return (
    <div
      className="rounded-2xl p-8 space-y-6"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div>
        <h2 className="text-xl font-extrabold text-slate-100 mb-1">Confirm your skills</h2>
        <p className="text-slate-500 text-sm">
          Skills from your resume have been added automatically. Add more or adjust proficiency levels.
        </p>
      </div>

      <SkillsManager onReady={setSkillCount} />

      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition"
          style={{ border: '1px solid rgba(255,255,255,0.08)' }}
        >
          ← Back
        </button>
        <button
          onClick={completeOnboarding}
          disabled={isCompleting}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50 hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          {isCompleting
            ? 'Finishing…'
            : skillCount > 0
            ? `Finish setup (${skillCount} skill${skillCount === 1 ? '' : 's'}) →`
            : 'Finish setup →'}
        </button>
      </div>
    </div>
  )
}
