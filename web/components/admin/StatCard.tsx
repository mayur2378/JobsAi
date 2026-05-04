interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  accent: string
  accentDim: string
}

export function StatCard({ label, value, sub, accent, accentDim }: StatCardProps) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{ background: '#0f0c1a', border: '1px solid rgba(139,92,246,0.15)' }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          borderRadius: '10px 10px 0 0',
          background: `linear-gradient(90deg, ${accent}, transparent)`,
        }}
      />
      <div className="font-mono text-xs uppercase tracking-widest mb-2" style={{ color: '#64748b' }}>
        {label}
      </div>
      <div className="font-mono font-bold leading-none mb-1" style={{ fontSize: 28, color: accent }}>
        {value}
      </div>
      {sub && (
        <div
          className="font-mono inline-flex items-center px-2 py-0.5 rounded"
          style={{ background: accentDim, color: accent, fontSize: 9, letterSpacing: '.04em' }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}
