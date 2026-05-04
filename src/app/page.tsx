'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getInProgressSession } from '@/lib/program'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    getInProgressSession().then(session => {
      if (session?.id) {
        router.replace(`/workout/${session.id}`)
      } else {
        router.replace('/today')
      }
    })
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-[#f97316] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
