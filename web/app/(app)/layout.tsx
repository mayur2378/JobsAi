import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0a0a0f' }}>
      {/* Sidebar placeholder — replaced in Plan 4 */}
      <aside
        className="w-52 flex-shrink-0 flex flex-col py-4"
        style={{
          background: '#0f0c1a',
          borderRight: '1px solid rgba(139,92,246,0.12)',
        }}
      >
        <div
          className="px-4 pb-4 text-base font-extrabold"
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          JobTrack AI
        </div>
        <nav className="flex-1 px-2 space-y-0.5 text-sm text-slate-500">
          <a href="/dashboard" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Dashboard</a>
          <a href="/jobs" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Jobs</a>
          <a href="/tracker" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Tracker</a>
          <a href="/analytics" className="block px-3 py-2 rounded-lg hover:text-slate-300 transition">Analytics</a>
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  )
}
