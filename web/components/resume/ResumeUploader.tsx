'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ResumeRecord {
  id: string
  file_name: string
  file_type: string
  is_active: boolean
  parsed_data: Record<string, unknown> | null
  parsed_at: string | null
}

interface ResumeUploaderProps {
  onUploaded: (resume: ResumeRecord) => void
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export function ResumeUploader({ onUploaded }: ResumeUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    const MAX_BYTES = 10 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      setError('File exceeds the 10 MB limit.')
      return
    }

    const ALLOWED = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
    if (!ALLOWED.includes(file.type)) {
      setError('Only PDF and DOCX files are accepted.')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated. Please sign in again.')

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`${API_URL}/api/v1/resume/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Upload failed')

      onUploaded(json.data as ResumeRecord)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload resume: click or drag and drop"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className="cursor-pointer rounded-xl p-10 text-center transition-all duration-200"
        style={{
          border: `2px dashed ${isDragging ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.2)'}`,
          background: isDragging ? 'rgba(139,92,246,0.05)' : 'transparent',
        }}
      >
        {isUploading ? (
          <div className="space-y-3">
            <div
              role="status"
              aria-label="Uploading resume"
              className="w-10 h-10 rounded-full border-2 border-purple-500/40 border-t-purple-500 animate-spin mx-auto"
            />
            <p className="text-slate-400 text-sm">Uploading…</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-4xl">📄</div>
            <div>
              <p className="text-slate-300 text-sm font-medium">Drop your resume here</p>
              <p className="text-slate-500 text-xs mt-1">PDF or DOCX, up to 10 MB</p>
            </div>
            <span
              className="inline-block px-4 py-2 rounded-lg text-xs font-semibold text-purple-300 transition hover:text-white"
              style={{ border: '1px solid rgba(139,92,246,0.3)' }}
            >
              Browse file
            </span>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleChange}
      />
      {error && (
        <p className="text-red-400 text-sm mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  )
}
