'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Briefcase, ListChecks, User } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: Briefcase },
  { href: '/tracker', label: 'Tracker', icon: ListChecks },
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
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm ${
              active
                ? 'text-violet-400 bg-violet-500/10'
                : 'text-slate-500 hover:bg-violet-500/5 hover:text-slate-300'
            }`}
          >
            <Icon size={14} strokeWidth={1.5} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
