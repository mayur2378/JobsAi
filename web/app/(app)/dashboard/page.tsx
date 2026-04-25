import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-slate-100">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          Signed in as {user?.email}
        </p>
      </div>
      <div
        className="rounded-xl p-6 text-slate-400 text-sm"
        style={{
          background: '#0f0c1a',
          border: '1px solid rgba(139,92,246,0.15)',
        }}
      >
        ✅ Auth working — Dashboard UI comes in Plan 4.
      </div>
    </div>
  )
}
