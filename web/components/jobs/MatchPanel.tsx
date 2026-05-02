'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScoreRing } from './ScoreRing'

interface RealtimeJobMatch {
  ai_refined: boolean
  refined_score: number | null
  skills_matched: string[] | null
  skills_missing: string[] | null
  match_explanation: string | null
  gaps_to_improve: string[] | null
}

interface MatchData {
  score: number
  label: string
  refinedScore: number | null
  aiRefined: boolean
  skillsMatched: string[]
  skillsMissing: string[]
  explanation: string | null
  gaps: string[]
  breakdown: {
    skills: number
    title: number
    location: number
    experience: number
    keywords: number
    salary: number
  } | null
}

interface MatchPanelProps {
  jobId: string
  initial: MatchData
}

const FACTOR_MAX: Record<string, number> = {
  skills: 35,
  title: 20,
  location: 15,
  experience: 15,
  keywords: 10,
  salary: 5,
}

const FACTOR_LABELS: Record<string, string> = {
  skills: 'Skills',
  title: 'Title',
  location: 'Location',
  experience: 'Experience',
  keywords: 'Keywords',
  salary: 'Salary',
}

const FACTOR_COLORS: Record<string, string> = {
  skills: '#34d399',
  title: '#a78bfa',
  location: '#8b5cf6',
  experience: '#fbbf24',
  keywords: '#a78bfa',
  salary: '#34d399',
}

export function MatchPanel({ jobId, initial }: MatchPanelProps) {
  const [data, setData] = useState<MatchData>(initial)

  useEffect(() => {
    if (data.aiRefined) return // already refined — no subscription needed

    const supabase = createClient()
    const channel = supabase
      .channel(`match-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'job_matches',
          filter: `job_id=eq.${jobId}`,
        },
        (payload) => {
          const updated = payload.new as RealtimeJobMatch
          if (updated.ai_refined) {
            setData((prev) => ({
              ...prev,
              refinedScore: updated.refined_score ?? null,
              aiRefined: true,
              skillsMatched: updated.skills_matched ?? prev.skillsMatched,
              skillsMissing: updated.skills_missing ?? prev.skillsMissing,
              explanation: updated.match_explanation ?? prev.explanation,
              gaps: updated.gaps_to_improve ?? prev.gaps,
            }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId, data.aiRefined])

  const displayScore = data.aiRefined && data.refinedScore != null ? data.refinedScore : data.score
  const isRefining = !data.aiRefined && data.score >= 40

  return (
    <div className="space-y-3">
      {/* Score hero */}
      <div
        className="rounded-xl p-5 relative overflow-hidden"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        {/* Top gradient bar */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: 'linear-gradient(90deg, #34d399, #8b5cf6, transparent)',
          }}
        />

        <div className="flex flex-col items-center mb-4">
          <ScoreRing score={displayScore} label={data.label} size="lg" isRefining={isRefining} />
          {data.aiRefined && (
            <span
              className="font-mono flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs"
              style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399', fontSize: 9 }}
            >
              ✦ AI Refined
            </span>
          )}
        </div>

        {/* Score breakdown */}
        {data.breakdown && (
          <>
            <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b', fontSize: 9, letterSpacing: '.1em' }}>
              Score Breakdown
            </div>
            <div className="space-y-2">
              {Object.entries(FACTOR_MAX).map(([key, max]) => {
                const val = data.breakdown ? (data.breakdown as Record<string, number>)[key] ?? 0 : 0
                const pct = (val / max) * 100
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="font-mono text-xs flex-shrink-0" style={{ color: '#64748b', width: 72, fontSize: 10 }}>
                      {FACTOR_LABELS[key]}
                    </span>
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: FACTOR_COLORS[key] }}
                      />
                    </div>
                    <span className="font-mono text-xs flex-shrink-0 text-right" style={{ color: FACTOR_COLORS[key], fontSize: 10, width: 32 }}>
                      {val}/{max}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* AI Explanation */}
      {data.explanation && (
        <div
          className="rounded-xl p-4"
          style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
        >
          <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b', fontSize: 9 }}>
            AI Explanation
          </div>
          <p className="text-xs italic leading-relaxed" style={{ color: '#94a3b8', lineHeight: 1.7 }}>
            &ldquo;{data.explanation}&rdquo;
          </p>
        </div>
      )}

      {/* Gaps to improve */}
      {data.gaps.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.2)' }}
        >
          <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#fbbf24', fontSize: 9 }}>
            Top Gaps to Close
          </div>
          <div className="space-y-0">
            {data.gaps.slice(0, 3).map((gap, i) => (
              <div
                key={i}
                className="flex gap-2.5 py-2 text-xs"
                style={{ borderBottom: i < data.gaps.length - 1 ? '1px solid rgba(251,191,36,0.1)' : 'none', color: '#cbd5e1', lineHeight: 1.5 }}
              >
                <span className="font-mono flex-shrink-0 mt-0.5" style={{ color: '#fbbf24', fontSize: 9 }}>
                  0{i + 1}
                </span>
                {gap}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
