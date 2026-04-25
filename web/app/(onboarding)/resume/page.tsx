'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ResumeUploader } from '@/components/resume/ResumeUploader'
import { ParsedResumePreview } from '@/components/resume/ParsedResumePreview'
import { apiFetch } from '@/lib/api'

interface ResumeRecord {
  id: string
  file_name: string
  file_type: string
  is_active: boolean
  parsed_data: Record<string, unknown> | null
  parsed_at: string | null
}

export default function OnboardingResumePage() {
  const router = useRouter()
  const [resume, setResume] = useState<ResumeRecord | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  function startPolling(resumeId: string) {
    setIsParsing(true)
    pollRef.current = setInterval(async () => {
      try {
        const data = await apiFetch<ResumeRecord>(`/resume/status/${resumeId}`)
        if (data.parsed_data) {
          setResume(data)
          setIsParsing(false)
          stopPolling()
        }
      } catch {
        // polling errors are non-fatal
      }
    }, 2000)
  }

  function handleUploaded(uploaded: ResumeRecord) {
    setResume(uploaded)
    startPolling(uploaded.id)
  }

  return (
    <div
      className="rounded-2xl p-8 space-y-6"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.2)' }}
    >
      <div>
        <h2 className="text-xl font-extrabold text-slate-100 mb-1">Upload your resume</h2>
        <p className="text-slate-500 text-sm">
          We&apos;ll use AI to extract your skills and experience automatically.
        </p>
      </div>

      {!resume ? (
        <ResumeUploader onUploaded={handleUploaded} />
      ) : (
        <ParsedResumePreview
          fileName={resume.file_name}
          parsedData={resume.parsed_data as Record<string, unknown> | null}
          isParsing={isParsing}
        />
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
          onClick={() => router.push('/onboarding/skills')}
          disabled={!resume}
          className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40 hover:opacity-90 transition"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
        >
          {resume ? 'Continue →' : 'Upload resume to continue'}
        </button>
      </div>
    </div>
  )
}
