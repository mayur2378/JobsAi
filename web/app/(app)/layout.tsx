import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { PushSetup } from '@/components/push/PushSetup'
import { PageViewLogger } from '@/components/layout/PageViewLogger'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', user.id)
    .single()

  if (!profile?.onboarding_completed) redirect('/onboarding/profile')

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <aside
        className="w-52 flex-shrink-0 flex flex-col py-4"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-default)' }}
      >
        <div
          className="px-4 pb-4 font-mono text-sm font-bold"
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            borderBottom: '1px solid rgba(139,92,246,0.12)',
            marginBottom: '8px',
          }}
        >
          JobTrack AI
        </div>
        <SidebarNav />
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
      <PageViewLogger />
      <PushSetup />
    </div>
  )
}
