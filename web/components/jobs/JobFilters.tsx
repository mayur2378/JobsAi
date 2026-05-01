'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { Search } from 'lucide-react'

interface JobFiltersProps {
  total: number
}

const SCORE_PRESETS = [
  { label: 'All', value: '0' },
  { label: '40+', value: '40' },
  { label: '60+', value: '60' },
  { label: '80+', value: '80' },
]

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Saved', value: 'saved' },
  { label: 'Applied', value: 'applied' },
  { label: 'Interviewing', value: 'interviewing' },
]

export function JobFilters({ total }: JobFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const current = {
    keyword: searchParams.get('keyword') ?? '',
    min_score: searchParams.get('min_score') ?? '40',
    remote: searchParams.get('remote') === 'true',
    status: searchParams.get('status') ?? '',
  }

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.delete('page') // reset to page 1 on filter change
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <div
      className="flex items-center gap-2 flex-wrap px-6 py-3 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(139,92,246,0.15)', background: '#0a0a0f' }}
    >
      {/* Keyword search */}
      <div
        className="flex items-center gap-2 flex-1 min-w-[180px] max-w-[260px] h-8 px-3 rounded-lg text-xs"
        style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.25)', color: '#94a3b8' }}
      >
        <Search size={12} strokeWidth={1.8} style={{ flexShrink: 0 }} />
        <input
          className="bg-transparent outline-none flex-1 text-xs placeholder:text-slate-600"
          style={{ color: '#e2e8f0' }}
          placeholder="Search jobs…"
          value={current.keyword}
          onChange={(e) => update('keyword', e.target.value)}
        />
      </div>

      {/* Score presets */}
      <div className="flex items-center gap-1">
        {SCORE_PRESETS.map(({ label, value }) => (
          <button
            key={value}
            onClick={() => update('min_score', value)}
            className="h-8 px-3 rounded-lg font-mono text-xs transition-all duration-150"
            style={{
              background: current.min_score === value ? 'rgba(139,92,246,0.12)' : '#0f0c1a',
              border: `1px solid ${current.min_score === value ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.15)'}`,
              color: current.min_score === value ? '#a78bfa' : '#64748b',
              cursor: 'pointer',
            }}
          >
            {label === 'All' ? 'All scores' : `Score ≥ ${label.replace('+', '')}`}
          </button>
        ))}
      </div>

      {/* Remote toggle */}
      <button
        onClick={() => update('remote', current.remote ? '' : 'true')}
        className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs transition-all duration-150"
        style={{
          background: current.remote ? 'rgba(52,211,153,0.1)' : '#0f0c1a',
          border: `1px solid ${current.remote ? 'rgba(52,211,153,0.3)' : 'rgba(139,92,246,0.15)'}`,
          color: current.remote ? '#34d399' : '#64748b',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 24,
            height: 13,
            borderRadius: 7,
            background: current.remote ? '#34d399' : 'rgba(255,255,255,0.1)',
            position: 'relative',
            transition: 'background 150ms',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 1.5,
              left: current.remote ? 12 : 1.5,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'white',
              transition: 'left 150ms',
            }}
          />
        </div>
        Remote
      </button>

      {/* Status filter */}
      <select
        value={current.status}
        onChange={(e) => update('status', e.target.value)}
        className="h-8 px-3 rounded-lg text-xs outline-none cursor-pointer font-mono"
        style={{
          background: current.status ? 'rgba(139,92,246,0.1)' : '#0f0c1a',
          border: `1px solid ${current.status ? 'rgba(139,92,246,0.3)' : 'rgba(139,92,246,0.15)'}`,
          color: current.status ? '#a78bfa' : '#64748b',
        }}
      >
        {STATUS_OPTIONS.map(({ label, value }) => (
          <option key={value} value={value} style={{ background: '#0f0c1a', color: '#e2e8f0' }}>
            {label === 'All' ? 'Status: All' : label}
          </option>
        ))}
      </select>

      {/* Result count */}
      <span className="ml-auto font-mono text-xs" style={{ color: '#64748b', whiteSpace: 'nowrap' }}>
        {total} job{total !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
