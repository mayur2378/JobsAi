'use client'

import { useState, useEffect, useRef } from 'react'
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

const MAX_PRIORITY = 10

export function SkillsManager({ onReady }: SkillsManagerProps) {
  const [skills, setSkills] = useState<Skill[]>([])
  const [prioritySkills, setPrioritySkills] = useState<string[]>([])
  const [newSkillName, setNewSkillName] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isSavingPriority, setIsSavingPriority] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const onReadyRef = useRef(onReady)
  useEffect(() => { onReadyRef.current = onReady })

  useEffect(() => {
    Promise.all([
      apiFetch<Skill[]>('/skills'),
      apiFetch<{ priority_skills?: string[] }>('/profile'),
    ])
      .then(([skillsData, profile]) => {
        setSkills(skillsData)
        setPrioritySkills(profile.priority_skills ?? [])
        onReadyRef.current?.(skillsData.length)
      })
      .catch(() => setError('Failed to load skills'))
      .finally(() => setIsLoading(false))
  }, [])

  async function togglePriority(skillName: string) {
    const isSelected = prioritySkills.includes(skillName)
    const next = isSelected
      ? prioritySkills.filter((s) => s !== skillName)
      : [...prioritySkills, skillName]

    if (!isSelected && next.length > MAX_PRIORITY) return

    setPrioritySkills(next)
    setIsSavingPriority(true)
    try {
      await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify({ priority_skills: next }),
      })
    } catch {
      setError('Failed to save priority skills')
      setPrioritySkills(prioritySkills) // revert
    } finally {
      setIsSavingPriority(false)
    }
  }

  async function addSkill() {
    setError(null)
    const name = newSkillName.trim()
    if (!name) return
    setIsAdding(true)
    try {
      const skill = await apiFetch<Skill>('/skills', {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      setSkills((prev) => {
        const next = [...prev, skill]
        onReady?.(next.length)
        return next
      })
      setNewSkillName('')
    } catch {
      setError('Failed to add skill')
    } finally {
      setIsAdding(false)
    }
  }

  async function updateProficiency(id: string, proficiency: Skill['proficiency']) {
    setError(null)
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
    setError(null)
    setDeletingId(id)
    try {
      const skill = skills.find((s) => s.id === id)
      await apiFetch(`/skills/${id}`, { method: 'DELETE' })
      setSkills((prev) => {
        const next = prev.filter((s) => s.id !== id)
        onReady?.(next.length)
        return next
      })
      // Remove from priority if it was selected
      if (skill && prioritySkills.includes(skill.name)) {
        const next = prioritySkills.filter((s) => s !== skill.name)
        setPrioritySkills(next)
        await apiFetch('/profile', {
          method: 'PUT',
          body: JSON.stringify({ priority_skills: next }),
        }).catch(() => {})
      }
    } catch {
      setError('Failed to remove skill')
    } finally {
      setDeletingId(null)
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

  const selectedCount = prioritySkills.length

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

      {/* Priority skills info */}
      {skills.length > 0 && (
        <div
          className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(244,114,182,0.05)', border: '1px solid rgba(244,114,182,0.15)' }}
        >
          <span style={{ color: '#94a3b8' }}>
            Check up to {MAX_PRIORITY} priority skills for stronger job matching
          </span>
          <span
            className="font-mono font-semibold"
            style={{ color: isSavingPriority ? '#64748b' : selectedCount === MAX_PRIORITY ? '#f472b6' : '#a78bfa' }}
          >
            {selectedCount}/{MAX_PRIORITY}
            {isSavingPriority && ' …'}
          </span>
        </div>
      )}

      {/* Skills list */}
      {skills.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">
          No skills yet. Add some above or upload a resume to auto-detect them.
        </p>
      ) : (
        <div className="space-y-2">
          {skills.map((skill) => {
            const isPriority = prioritySkills.includes(skill.name)
            const canSelect = isPriority || selectedCount < MAX_PRIORITY

            return (
              <div
                key={skill.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{
                  background: isPriority ? 'rgba(244,114,182,0.06)' : 'rgba(255,255,255,0.03)',
                  border: isPriority
                    ? '1px solid rgba(244,114,182,0.25)'
                    : '1px solid rgba(255,255,255,0.06)',
                }}
              >
                {/* Priority checkbox */}
                <button
                  onClick={() => togglePriority(skill.name)}
                  disabled={!canSelect && !isPriority}
                  aria-label={`${isPriority ? 'Remove' : 'Add'} ${skill.name} as priority skill`}
                  className="flex-shrink-0 mr-2.5 disabled:opacity-30 transition"
                  title={!canSelect ? `Max ${MAX_PRIORITY} priority skills selected` : undefined}
                >
                  <div
                    className="w-4 h-4 rounded flex items-center justify-center transition-all"
                    style={{
                      background: isPriority ? 'rgba(244,114,182,0.3)' : 'rgba(255,255,255,0.05)',
                      border: isPriority
                        ? '1.5px solid rgba(244,114,182,0.8)'
                        : '1.5px solid rgba(255,255,255,0.15)',
                    }}
                  >
                    {isPriority && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="#f472b6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </button>

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
                  {isPriority && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 font-mono"
                      style={{ background: 'rgba(244,114,182,0.1)', color: '#f472b6', fontSize: 9 }}
                    >
                      priority
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <select
                    value={skill.proficiency ?? ''}
                    onChange={(e) =>
                      updateProficiency(skill.id, (e.target.value || null) as Skill['proficiency'])
                    }
                    aria-label={`Proficiency for ${skill.name}`}
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
                    disabled={deletingId === skill.id}
                    aria-label={`Remove ${skill.name}`}
                    className="text-slate-600 hover:text-red-400 transition text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
