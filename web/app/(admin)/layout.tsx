export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#0f172a', minHeight: '100vh', color: '#e2e8f0' }}>
      <div
        style={{
          borderBottom: '1px solid rgba(139,92,246,0.15)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          className="font-mono text-xs font-bold"
          style={{ color: '#a78bfa', letterSpacing: '0.08em', textTransform: 'uppercase' }}
        >
          Admin
        </span>
        <span style={{ color: '#334155' }}>·</span>
        <span className="font-mono text-xs" style={{ color: '#64748b' }}>
          JobTrack AI
        </span>
      </div>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  )
}
