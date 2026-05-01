'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  limit: number
}

export function Pagination({ page, totalPages, total, limit }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  if (totalPages <= 1) return null

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(p))
    router.push(`${pathname}?${params.toString()}`)
  }

  const start = (page - 1) * limit + 1
  const end = Math.min(page * limit, total)

  const visiblePages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
    if (totalPages <= 5) return i + 1
    if (page <= 3) return i + 1
    if (page >= totalPages - 2) return totalPages - 4 + i
    return page - 2 + i
  })

  return (
    <div
      className="flex items-center justify-between px-6 py-3 flex-shrink-0"
      style={{ borderTop: '1px solid rgba(139,92,246,0.15)' }}
    >
      <span className="font-mono text-xs" style={{ color: '#64748b' }}>
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{
            background: '#0f0c1a',
            border: '1px solid rgba(139,92,246,0.15)',
            color: page <= 1 ? '#334155' : '#64748b',
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronLeft size={14} />
        </button>

        {visiblePages.map((p) => (
          <button
            key={p}
            onClick={() => goToPage(p)}
            className="w-8 h-8 flex items-center justify-center rounded-lg font-mono text-xs transition-all duration-150"
            style={{
              background: p === page ? 'rgba(139,92,246,0.12)' : '#0f0c1a',
              border: `1px solid ${p === page ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.15)'}`,
              color: p === page ? '#a78bfa' : '#64748b',
              fontWeight: p === page ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages}
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{
            background: '#0f0c1a',
            border: '1px solid rgba(139,92,246,0.15)',
            color: page >= totalPages ? '#334155' : '#64748b',
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
