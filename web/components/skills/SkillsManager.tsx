'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'

interface Skill {
  id: string
  name: string
  source: 'resume' | 'manual'
  proficiency: 'beginner' | 'intermediate' | 'expert' | null
}

const PROFICIENCY_COLORS: Record<string, string> = {
  beginner: 'rgba(251,191,36,0.15)',
  intermediate: 'rgba(52,211,153,0.15)',
  expert: 'rgba(139,92,246,0.2)',
}

const PROFICIENCY_TEXT: Record<string, string> = {
  beginner: '#fbbf24',
  intermediate: '#34d399',
  expert: '#a78bfa',
}

interface SkillsManagerProps {
  onReady?: (count: number) => void
}

export function SkillsManager({ onReady }: SkillsManagerProps) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Skill[]>('/skills')
      .then((data) => {
        setSkills(data)
        onReady?.(data.length)
      })
      .catch(() => setError('Failed to load skills'))
      .finally(() => setIsLoading(false))
  }, [])

  async function addSkill() {
    const name = newSkillName.trim()
    if (!name) return
    setIsAdding(true)
    try {
      const skill = await apiFetch<Skill>('/skills', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setSkills((prev) => [...prev, skill])
      setNewSkillName('')
      onReady?.(skills.length + 1)
    } catch {
      setError('Failed to add skill')
    } finally {
      setIsAdding(false)
    }
  }

  async function updateProficiency(id: string, proficiency: Skill['proficiency']) {
    try {
      const updated = await apiFetch<Skill>(`/skills/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ proficiency }),
      })
      setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)))
    } catch {
      setError('Failed to update skill')
    }
  }

  async function removeSkill(id: string) {
    try {
      await apiFetch(`/skills/${id}`, { method: 'DELETE' })
      const next = skills.filter((s) => s.id !== id)
      setSkills(next)
      onReady?.(next.length)
    } catch {
      setError('Failed to remove skill')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
        <div className="w-4 h-4 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
        Loading skills…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Add skill input */}
      <div className="flex gap-2">
        <input
          value={newSkillName}
          onChange={(e) => setNewSkillName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSkill()}
          placeholder="Add a skill (e.g. TypeScript)"
          className="flex-1 px-3 py-2.5 rounded-lg text-sm text-slate-100 placeholder-slate-500 bg-white/5 border border-purple-500/20 focus:outline-none focus:border-purple-500/60 transition"
        />
        <button
          onClick={addSkill}
          disabled={isAdding || !newSkillName.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          {isAdding ? '…' : 'Add'}
        </button>
      </div>

      {/* Skills list */}
      {skills.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">
          No skills yet. Add some above or upload a resume to auto-detect them.
        </p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-slate-200 text-sm font-medium truncate">{skill.name}</span>
                {skill.source === 'resume' && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}
                  >
                    resume
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2">
                <select
                  value={skill.proficiency ?? ''}
                  onChange={(e) =>
                    updateProficiency(skill.id, (e.target.value || null) as Skill['proficiency'])
                  }
                  className="text-xs rounded-md px-2 py-1 border-0 outline-none cursor-pointer"
                  style={{
                    background: skill.proficiency
                      ? PROFICIENCY_COLORS[skill.proficiency]
                      : 'rgba(255,255,255,0.05)',
                    color: skill.proficiency ? PROFICIENCY_TEXT[skill.proficiency] : '#6b7280',
                  }}
                >
                  <option value="">Level</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="expert">Expert</option>
                </select>
                <button
                  onClick={() => removeSkill(skill.id)}
                  className="text-slate-600 hover:text-red-400 transition text-xs px-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
