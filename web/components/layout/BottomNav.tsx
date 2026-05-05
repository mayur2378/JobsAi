'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, ListChecks, User, BarChart3 } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home',      icon: LayoutDashboard },
  { href: '/jobs',      label: 'Jobs',      icon: Briefcase },
  { href: '/tracker',   label: 'Tracker',   icon: ListChecks },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/profile',   label: 'Profile',   icon: User },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around px-2 py-2 z-50"
      style={{
        background: '#0a0812',
        borderTop: '1px solid rgba(139,92,246,0.15)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
      }}
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all"
            style={{ color: active ? '#a78bfa' : '#475569', minWidth: 44, minHeight: 44, justifyContent: 'center' }}
          >
            <Icon size={20} strokeWidth={active ? 2 : 1.5} />
            <span style={{ fontSize: 9, letterSpacing: '.04em', fontFamily: 'monospace' }}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
