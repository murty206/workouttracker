'use client'
import { useEffect, useRef } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'

export function RestTimer() {
  const seconds = useWorkoutStore(s => s.restTimerSeconds)
  const total = useWorkoutStore(s => s.restTimerTotal)
  const tick = useWorkoutStore(s => s.tickTimer)
  const stop = useWorkoutStore(s => s.stopTimer)
  const startTimer = useWorkoutStore(s => s.startTimer)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(tick, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [tick])

  useEffect(() => {
    if (seconds === 0 && total > 0) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      // Vibrate on completion
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 400])
      }
    }
  }, [seconds, total])

  const pct = total > 0 ? (seconds / total) * 100 : 0
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  const display = `${mins}:${String(secs).padStart(2, '0')}`

  if (seconds === 0) return null

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 max-w-lg mx-auto px-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-[#888888]">Rest Timer</span>
          <button onClick={stop} className="text-[#888888]"><X size={18} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-[#f97316] rounded-full transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => startTimer(Math.max(15, seconds - 15))}
            className="flex items-center gap-1 text-sm text-[#888888] bg-[#242424] px-3 py-1.5 rounded-lg"
          >
            <Minus size={14} /> 15s
          </button>

          <span className="text-4xl font-bold tabular-nums text-[#f97316]">{display}</span>

          <button
            onClick={() => startTimer(seconds + 30)}
            className="flex items-center gap-1 text-sm text-[#888888] bg-[#242424] px-3 py-1.5 rounded-lg"
          >
            <Plus size={14} /> 30s
          </button>
        </div>
      </div>
    </div>
  )
}
