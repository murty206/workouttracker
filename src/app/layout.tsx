import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Seeder } from '@/components/layout/Seeder'
import { BottomNav } from '@/components/layout/BottomNav'

export const metadata: Metadata = {
  title: 'Workout Tracker',
  description: '12-week strength training program tracker',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f0f0f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0f0f0f] text-[#f5f5f5] min-h-screen pb-20 antialiased">
        <Seeder />
        <main className="max-w-lg mx-auto px-4">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  )
}
