'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { apiFetch } from '@/lib/api'

export function RefreshButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'rate-limited'>('idle')
  const [message, setMessage] = useState('')

  async function handleRefresh() {
    setState('loading')
    try {
      await apiFetch('/jobs/refresh', { method: 'POST' })
      setState('done')
      setTimeout(() => setState('idle'), 3000)
    } catch (err: unknown) {
      if (err instanceof Error && err.message?.includes('once per hour')) {
        setState('rate-limited')
        setMessage('Next refresh available in ~1h')
        setTimeout(() => setState('idle'), 5000)
      } else if (err.message?.includes('Too many requests') || err.message?.includes('429')) {
        setState('rate-limited')
        setMessage('Too many requests — try again shortly')
        setTimeout(() => setState('idle'), 5000)
      } else {
        setState('idle')
      }
    }
  }

  const isDisabled = state === 'loading' || state === 'rate-limited'

  return (
    <button
      onClick={handleRefresh}
      disabled={isDisabled}
      className="flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs transition-all duration-150"
      style={{
        background: state === 'done' ? 'rgba(52,211,153,0.1)' : 'rgba(139,92,246,0.1)',
        border: `1px solid ${state === 'done' ? 'rgba(52,211,153,0.3)' : 'rgba(139,92,246,0.3)'}`,
        color: state === 'done' ? '#34d399' : '#a78bfa',
        opacity: isDisabled && state !== 'loading' ? 0.6 : 1,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
      }}
    >
      <RefreshCw
        size={12}
        strokeWidth={1.8}
        style={{ animation: state === 'loading' ? 'spin 1s linear infinite' : 'none' }}
      />
      {state === 'idle' && 'Refresh Jobs'}
      {state === 'loading' && 'Refreshing…'}
      {state === 'done' && '✓ Triggered'}
      {state === 'rate-limited' && message}
    </button>
  )
}
