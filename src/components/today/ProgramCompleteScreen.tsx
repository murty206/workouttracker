'use client'
import { useState } from 'react'
import { Trophy, RefreshCw } from 'lucide-react'
import { restartProgram } from '@/lib/program'
import { useRouter } from 'next/navigation'

export function ProgramCompleteScreen() {
  const router = useRouter()
  const [restarting, setRestarting] = useState(false)

  async function handleRestart() {
    setRestarting(true)
    await restartProgram()
    router.refresh()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center space-y-6 px-4">
      <div className="w-20 h-20 rounded-full bg-[#f97316]/20 flex items-center justify-center">
        <Trophy size={40} className="text-[#f97316]" />
      </div>
      <div>
        <h1 className="text-3xl font-bold mb-2">Program Complete!</h1>
        <p className="text-[#888888] text-lg">You finished all 12 weeks.</p>
        <p className="text-[#888888] mt-1">Your progress has been saved.</p>
      </div>
      <button
        onClick={handleRestart}
        disabled={restarting}
        className="flex items-center gap-2 bg-[#f97316] text-white font-semibold py-4 px-8 rounded-2xl disabled:opacity-50"
      >
        <RefreshCw size={20} />
        {restarting ? 'Restarting…' : 'Start New Cycle'}
      </button>
      <p className="text-xs text-[#888888]">Week 1 will start with your final weights</p>
    </div>
  )
}
