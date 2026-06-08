'use client'
import { CheckCircle2, Circle, Footprints } from 'lucide-react'
import { db } from '@/lib/db'
import type { TemplateExercise, Exercise, SetLog } from '@/types'

interface Props {
  te: TemplateExercise
  exercise: Exercise
  sessionLogs: SetLog[]
  sessionId: number
  onToggle: () => void
}

export function CardioCard({ te, exercise, sessionLogs, sessionId, onToggle }: Props) {
  const tickLog = sessionLogs.find(l => !l.isWarmup)
  const isTicked = !!tickLog

  const duration = te.cardioDurationMin ?? 30
  const incline = te.cardioInclinePct ?? 7
  const speed = te.cardioSpeedKmh ?? 5

  async function handleClick() {
    if (isTicked && tickLog?.id !== undefined) {
      await db.setLogs.delete(tickLog.id)
    } else {
      await db.setLogs.add({
        sessionId,
        exerciseId: exercise.id!,
        setNumber: 1,
        weightKg: null,
        reps: 1,
        isWarmup: false,
        isPR: false,
        loggedAt: new Date().toISOString(),
      })
    }
    onToggle()
  }

  return (
    <button
      onClick={handleClick}
      className={`w-full bg-[#1a1a1a] rounded-2xl border p-4 flex items-center gap-3 text-left transition-colors ${
        isTicked ? 'border-[#22c55e]/40' : 'border-[#2a2a2a]'
      }`}
    >
      <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
        isTicked ? 'bg-[#22c55e]/10' : 'bg-[#242424]'
      }`}>
        <Footprints size={18} className={isTicked ? 'text-[#22c55e]' : 'text-[#888888]'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${isTicked ? 'line-through text-[#888888]' : ''}`}>
          {exercise.name}
        </p>
        <p className="text-xs text-[#888888] mt-0.5 tabular-nums">
          {duration} min · {incline}% · {speed} km/h
        </p>
      </div>
      {isTicked
        ? <CheckCircle2 size={22} className="text-[#22c55e] shrink-0" />
        : <Circle size={22} className="text-[#555555] shrink-0" />}
    </button>
  )
}
