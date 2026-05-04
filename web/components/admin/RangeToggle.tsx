'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const RANGES = [7, 30, 90] as const

export function RangeToggle({ current }: { current: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function setRange(days: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', String(days))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex gap-1.5">
      {RANGES.map((d) => (
        <button
          key={d}
          onClick={() => setRange(d)}
          className="font-mono text-xs px-3 py-1.5 rounded-lg transition-all"
          style={
            current === d
              ? {
                  background: 'rgba(139,92,246,0.2)',
                  border: '1px solid rgba(139,92,246,0.5)',
                  color: '#c4b5fd',
                }
              : {
                  background: 'rgba(139,92,246,0.05)',
                  border: '1px solid rgba(139,92,246,0.15)',
                  color: '#64748b',
                  cursor: 'pointer',
                }
          }
        >
          {d}d
        </button>
      ))}
    </div>
  )
}
