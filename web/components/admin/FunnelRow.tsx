import type { FunnelStats } from './adminQueries'

const STEPS = [
  { key: 'saved' as const,        label: 'Saved' },
  { key: 'applied' as const,      label: 'Applied' },
  { key: 'interviewing' as const, label: 'Interviewing' },
  { key: 'offers' as const,       label: 'Offers' },
  { key: 'rejected' as const,     label: 'Rejected' },
]

export function FunnelRow({ stats }: { stats: FunnelStats }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {STEPS.map(({ key, label }) => (
        <div
          key={key}
          className="rounded-xl p-4 text-center"
          style={{ background: '#0f0c1a', border: '1px solid rgba(251,191,36,0.15)' }}
        >
          <div className="font-mono font-bold" style={{ fontSize: 22, color: '#fbbf24' }}>
            {stats[key]}
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: '#64748b' }}>{label}</div>
        </div>
      ))}
      <div
        className="rounded-xl p-4 text-center"
        style={{ background: '#0f0c1a', border: '1px solid rgba(52,211,153,0.2)' }}
      >
        <div className="font-mono font-bold" style={{ fontSize: 22, color: '#34d399' }}>
          {stats.applyRate}%
        </div>
        <div className="font-mono text-xs mt-1" style={{ color: '#64748b' }}>Apply Rate</div>
      </div>
    </div>
  )
}
