import type { PipelineHealth } from './analyticsQueries'

interface CardProps {
  label: string
  value: string | number
  sub: string
  accent: string
  accentDim: string
}

function HealthCard({ label, value, sub, accent, accentDim }: CardProps) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: '10px 10px 0 0',
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        }}
      />
      <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
        {label}
      </div>
      <div className="font-mono font-bold leading-none mb-1" style={{ fontSize: 28, color: accent }}>
        {value}
      </div>
      <div
        className="font-mono inline-flex items-center px-2 py-0.5 rounded text-xs"
        style={{ background: accentDim, color: accent, fontSize: 9, letterSpacing: '.04em' }}
      >
        {sub}
      </div>
    </div>
  )
}

export function PipelineHealthCards({ health }: { health: PipelineHealth }) {
  const cards: CardProps[] = [
    {
      label: 'Jobs This Week',
      value: health.jobsThisWeek,
      sub: 'scraped last 7d',
      accent: '#38bdf8',
      accentDim: 'rgba(56,189,248,0.12)',
    },
    {
      label: 'Matches This Week',
      value: health.matchesThisWeek,
      sub: 'computed last 7d',
      accent: '#a78bfa',
      accentDim: 'rgba(167,139,250,0.12)',
    },
    {
      label: 'AI Refined Rate',
      value: `${health.aiRefinedRate}%`,
      sub: 'last 30d',
      accent: '#34d399',
      accentDim: 'rgba(52,211,153,0.12)',
    },
    {
      label: 'Avg Match Score',
      value: health.avgMatchScore,
      sub: 'all time',
      accent: '#fbbf24',
      accentDim: 'rgba(251,191,36,0.12)',
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((c) => (
        <HealthCard key={c.label} {...c} />
      ))}
    </div>
  )
}
