'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/api'

interface Note {
  id: string
  content: string
  created_at: string
}

interface NotesPanelProps {
  applicationId: string
}

export function NotesPanel({ applicationId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setLoading(true)
    apiFetch<Note[]>(`/applications/${applicationId}/notes`)
      .then(setNotes)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [applicationId])

  async function handleAdd() {
    const trimmed = content.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const note = await apiFetch<Note>(`/applications/${applicationId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: trimmed }),
      })
      setNotes((prev) => [...prev, note])
      setContent('')
      textareaRef.current?.focus()
    } catch {
      // fail silently
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
    try {
      await apiFetch(`/applications/notes/${noteId}`, { method: 'DELETE' })
    } catch {
      // fail silently — note already removed from UI
    }
  }

  return (
    <div className="px-4 py-3">
      <div
        className="font-mono text-xs font-semibold tracking-widest mb-3"
        style={{ color: '#6b7280' }}
      >
        NOTES
      </div>

      {loading ? (
        <div className="text-xs" style={{ color: '#4b5563' }}>Loading…</div>
      ) : (
        <div className="flex flex-col gap-2 mb-3">
          {notes.length === 0 && (
            <div className="text-xs" style={{ color: '#4b5563' }}>No notes yet.</div>
          )}
          {notes.map((note) => (
            <div
              key={note.id}
              className="group relative rounded-lg px-3 py-2 text-xs"
              style={{
                background: '#13101f',
                border: '1px solid rgba(139,92,246,0.12)',
                color: '#94a3b8',
                lineHeight: 1.5,
              }}
            >
              {note.content}
              <button
                onClick={() => handleDelete(note.id)}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded"
                style={{ color: '#4b5563' }}
                aria-label="Delete note"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add note */}
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
          }}
          placeholder="Add a note… (⌘↵ to save)"
          rows={2}
          disabled={saving}
          className="flex-1 text-xs rounded-lg px-2.5 py-2 outline-none resize-none"
          style={{
            background: '#13101f',
            border: '1px solid rgba(139,92,246,0.2)',
            color: '#e2e8f0',
          }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !content.trim()}
          className="text-xs font-mono rounded-lg px-3 py-2 transition-all duration-150"
          style={{
            background: saving || !content.trim() ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.2)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: saving || !content.trim() ? '#4b5563' : '#a78bfa',
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}
