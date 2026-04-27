'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, ListChecks, BarChart2, User } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
  { href: '/analytics', label: 'Analytics', icon: BarChart2 },
  { href: '/profile', label: 'Profile', icon: User },
]

export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-2 space-y-0.5 text-sm">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150"
            style={{
              color: active ? '#a78bfa' : '#64748b',
              background: active ? 'rgba(139,92,246,0.12)' : 'transparent',
            }}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
