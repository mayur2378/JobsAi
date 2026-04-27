interface ScoreRingProps {
  score: number
  label: string
  size?: 'sm' | 'lg'
  showLabel?: boolean
  isRefining?: boolean
}

const LABEL_CONFIG: Record<string, { display: string; color: string; border: string; bg: string }> = {
  excellent: {
    display: 'Strong',
    color: '#34d399',
    border: 'rgba(52,211,153,0.4)',
    bg: 'rgba(52,211,153,0.08)',
  },
  strong: {
    display: 'Good',
    color: '#a78bfa',
    border: 'rgba(139,92,246,0.4)',
    bg: 'rgba(139,92,246,0.08)',
  },
  good: {
    display: 'Possible',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.35)',
    bg: 'rgba(251,191,36,0.08)',
  },
  low: {
    display: 'Low',
    color: '#64748b',
    border: 'rgba(100,116,139,0.3)',
    bg: 'rgba(100,116,139,0.06)',
  },
}

export function ScoreRing({ score, label, size = 'sm', showLabel = true, isRefining = false }: ScoreRingProps) {
  const cfg = LABEL_CONFIG[label] ?? LABEL_CONFIG.low
  const isLg = size === 'lg'

  return (
    <div className="flex flex-col items-center" style={{ minWidth: isLg ? 72 : 52 }}>
      <div
        style={{
          width: isLg ? 72 : 44,
          height: isLg ? 72 : 44,
          borderRadius: '50%',
          background: cfg.bg,
          border: `${isLg ? 2 : 1.5}px solid ${cfg.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          marginBottom: 4,
        }}
      >
        <span
          className="font-mono font-bold leading-none"
          style={{ fontSize: isLg ? 24 : 15, color: cfg.color }}
        >
          {score}
        </span>
      </div>
      {showLabel && (
        <span
          className="font-mono text-center"
          style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '.06em', color: '#64748b' }}
        >
          {cfg.display}
        </span>
      )}
      {isRefining && (
        <span
          className="font-mono flex items-center gap-1 mt-1"
          style={{ fontSize: 8, color: '#fbbf24' }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: '#fbbf24',
              display: 'inline-block',
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
          Refining
        </span>
      )}
    </div>
  )
}
