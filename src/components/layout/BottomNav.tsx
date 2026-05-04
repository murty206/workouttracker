'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Dumbbell, History, TrendingUp, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/today', label: 'Today', icon: Dumbbell },
  { href: '/history', label: 'History', icon: History },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  // Hide bottom nav during active workout
  if (pathname.startsWith('/workout/')) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] border-t border-[#2a2a2a] z-50">
      <div className="max-w-lg mx-auto flex">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === '/today' && pathname === '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors',
                active ? 'text-[#f97316]' : 'text-[#888888]'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
