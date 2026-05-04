interface TopPage {
  path: string
  count: number
}

export function TopPagesTable({ pages }: { pages: TopPage[] }) {
  if (pages.length === 0) {
    return <p className="font-mono text-xs mt-2" style={{ color: '#64748b' }}>No page view data yet</p>
  }
  const max = pages[0]?.count ?? 1
  return (
    <div className="space-y-2 mt-3">
      {pages.map(({ path, count }) => (
        <div key={path} className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div
              className="h-1.5 rounded-full"
              style={{
                background: 'rgba(167,139,250,0.25)',
                width: `${Math.round((count / max) * 100)}%`,
                minWidth: 4,
              }}
            />
          </div>
          <span title={path} className="font-mono text-xs shrink-0" style={{ color: '#94a3b8', width: 100, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {path}
          </span>
          <span className="font-mono text-xs shrink-0" style={{ color: '#a78bfa', width: 32, textAlign: 'right' }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}
