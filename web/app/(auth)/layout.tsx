export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'radial-gradient(ellipse at top, #1a0a2e 0%, #0a0a0f 60%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1
            className="text-2xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            JobTrack AI
          </h1>
          <p className="text-slate-500 text-sm mt-1">Powered by Claude</p>
        </div>
        <div
          className="rounded-2xl p-8"
          style={{
            background: '#0f0c1a',
            border: '1px solid rgba(139, 92, 246, 0.2)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
