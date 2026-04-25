'use client'

import { ProfileForm } from './ProfileForm'
import { ResumeUploader } from '../resume/ResumeUploader'
import { ParsedResumePreview } from '../resume/ParsedResumePreview'
import { SkillsManager } from '../skills/SkillsManager'
import { useState, useEffect, useRef } from 'react'
import { apiFetch } from '@/lib/api'

interface Profile {
  id: string
  full_name: string | null
  location: string | null
  phone: string | null
  work_preference: string | null
  years_experience: number | null
  salary_min: number | null
  salary_max: number | null
  desired_titles: string[]
  industries: string[]
}

interface ResumeRecord {
  id: string
  file_name: string
  file_type?: string
  parsed_data: Record<string, unknown> | null
  parsed_at: string | null
  is_active: boolean
}

interface ProfilePageClientProps {
  profile: Profile | null
  userEmail: string
}

export function ProfilePageClient({ profile, userEmail }: ProfilePageClientProps) {
  const [resume, setResume] = useState<ResumeRecord | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    apiFetch<ResumeRecord | null>('/resume').then(setResume).catch(() => null)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  function handleUploaded(uploaded: ResumeRecord) {
    setResume(uploaded)
    setIsParsing(true)
    let attempts = 0
    const MAX_ATTEMPTS = 30
    pollRef.current = setInterval(async () => {
      attempts++
      if (attempts > MAX_ATTEMPTS) {
        if (pollRef.current) clearInterval(pollRef.current)
        setIsParsing(false)
        return
      }
      try {
        const data = await apiFetch<ResumeRecord>(`/resume/status/${uploaded.id}`)
        if (data.parsed_data) {
          setResume(data)
          setIsParsing(false)
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch { /* non-fatal */ }
    }, 2000)
  }

  // ProfileForm uses z.string() for numeric fields — convert numbers to strings
  const defaultValues = profile
    ? {
        full_name: profile.full_name ?? '',
        location: profile.location ?? '',
        phone: profile.phone ?? '',
        work_preference: (profile.work_preference as 'remote' | 'hybrid' | 'onsite') ?? undefined,
        years_experience: profile.years_experience?.toString() ?? undefined,
        salary_min: profile.salary_min?.toString() ?? undefined,
        salary_max: profile.salary_max?.toString() ?? undefined,
        desired_titles: (profile.desired_titles ?? []).map((v) => ({ value: v })),
        industries: (profile.industries ?? []).map((v) => ({ value: v })),
      }
    : {}

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-extrabold text-slate-100">Profile</h1>
        <p className="text-slate-500 text-sm mt-1">{userEmail}</p>
      </div>

      {/* Profile details */}
      <section
        className="rounded-2xl p-6"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <h2 className="text-base font-bold text-slate-200 mb-5">Personal details</h2>
        <ProfileForm defaultValues={defaultValues} nextPath="/dashboard" submitLabel="Save changes" />
      </section>

      {/* Resume */}
      <section
        className="rounded-2xl p-6 space-y-4"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <h2 className="text-base font-bold text-slate-200">Resume</h2>
        {resume ? (
          <ParsedResumePreview
            fileName={resume.file_name}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            parsedData={resume.parsed_data as any}
            isParsing={isParsing}
          />
        ) : (
          <ResumeUploader onUploaded={handleUploaded} />
        )}
        {resume && (
          <button
            onClick={() => setResume(null)}
            className="text-sm text-purple-400 hover:text-purple-300 transition"
          >
            Replace resume
          </button>
        )}
      </section>

      {/* Skills */}
      <section
        className="rounded-2xl p-6"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
      >
        <h2 className="text-base font-bold text-slate-200 mb-5">Skills</h2>
        <SkillsManager />
      </section>
    </div>
  )
}
