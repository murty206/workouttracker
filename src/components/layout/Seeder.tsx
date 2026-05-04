'use client'
import { useEffect, useState } from 'react'
import { seedIfEmpty } from '@/lib/seed'

export function Seeder() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    seedIfEmpty().catch(err => {
      console.error('Seeding failed:', err)
      setError(err?.message ?? String(err))
    })
  }, [])

  if (!error) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-800 text-white px-4 py-3 z-50 text-xs">
      DB error: {error}
    </div>
  )
}
