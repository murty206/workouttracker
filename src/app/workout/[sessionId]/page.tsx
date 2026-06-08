'use client'
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { db } from '@/lib/db'
import { applyProgression } from '@/lib/progression'
import type { TemplateExercise, Exercise, SetLog } from '@/types'
import { ExerciseCard } from '@/components/workout/ExerciseCard'
import { CardioCard } from '@/components/workout/CardioCard'
import { RestTimer } from '@/components/workout/RestTimer'
import { WorkoutSummary } from '@/components/workout/WorkoutSummary'

interface ExerciseBlock {
  te: TemplateExercise
  exercise: Exercise
  logs: SetLog[]
}

export default function WorkoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId: sessionIdStr } = use(params)
  const sessionId = parseInt(sessionIdStr)
  const router = useRouter()

  const [blocks, setBlocks] = useState<ExerciseBlock[]>([])
  const [showSummary, setShowSummary] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [workoutLabel, setWorkoutLabel] = useState('')
  const [weekNumber, setWeekNumber] = useState<number | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    if (showSummary) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [showSummary])

  useEffect(() => {
    async function load() {
      const session = await db.sessions.get(sessionId)
      if (!session?.workoutTemplateId) return
      setWorkoutLabel(session.workoutLabel)
      setWeekNumber(session.weekNumber)

      const tes = await db.templateExercises
        .where('workoutTemplateId').equals(session.workoutTemplateId)
        .sortBy('orderInWorkout')

      const blocks = await Promise.all(
        tes.map(async te => {
          const exercise = await db.exercises.get(te.exerciseId)
          const logs = await db.setLogs
            .where('sessionId').equals(sessionId)
            .filter(l => l.exerciseId === te.exerciseId)
            .toArray()
          return { te, exercise: exercise!, logs }
        })
      )
      setBlocks(blocks)
    }
    load()
  }, [sessionId])

  // Refresh logs when sets are added
  async function refreshLogs(exerciseId: number) {
    const logs = await db.setLogs
      .where('sessionId').equals(sessionId)
      .filter(l => l.exerciseId === exerciseId)
      .toArray()
    setBlocks(prev => prev.map(b =>
      b.exercise.id === exerciseId ? { ...b, logs } : b
    ))
  }

  async function handleFinish() {
    setFinishing(true)
    await db.sessions.update(sessionId, { completedAt: new Date().toISOString() })
    await applyProgression(sessionId)
    setShowSummary(true)
    setFinishing(false)
  }

  const totalSets = blocks.reduce((sum, b) => sum + b.te.plannedSets, 0)
  const loggedSets = blocks.reduce((sum, b) => sum + b.logs.filter(l => !l.isWarmup).length, 0)
  const allDone = loggedSets >= totalSets

  const weekLabel = weekNumber === 13 ? 'Rest Week' : `Week ${weekNumber}`

  return (
    <div className="py-4 space-y-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 sticky top-0 bg-[#0f0f0f] py-2 z-10">
        <button
          onClick={() => setConfirmLeave(true)}
          className="text-[#888888] p-1"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <p className="text-xs text-[#888888]">{weekLabel}</p>
          <h1 className="font-bold text-lg leading-tight">Workout {workoutLabel}</h1>
        </div>
        <span className="text-xs text-[#888888] tabular-nums">
          {loggedSets}/{totalSets} sets
        </span>
      </div>

      {/* Exercise cards */}
      <div className="space-y-4 pb-32">
        {blocks.map(({ te, exercise, logs }) => (
          exercise.equipmentType === 'cardio' ? (
            <CardioCard
              key={te.id}
              te={te}
              exercise={exercise}
              sessionLogs={logs}
              sessionId={sessionId}
              onToggle={() => refreshLogs(exercise.id!)}
            />
          ) : (
            <ExerciseCard
              key={te.id}
              te={te}
              exercise={exercise}
              sessionLogs={logs}
              sessionId={sessionId}
              onSetLogged={() => refreshLogs(exercise.id!)}
            />
          )
        ))}
      </div>

      {/* Finish button */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-[#2a2a2a] p-4 max-w-lg mx-auto">
        <button
          onClick={handleFinish}
          disabled={finishing || showSummary}
          className={`w-full font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors ${
            allDone
              ? 'bg-[#f97316] text-white'
              : 'bg-[#1a1a1a] text-[#888888] border border-[#2a2a2a]'
          }`}
        >
          <CheckCircle size={20} />
          {finishing ? 'Saving…' : allDone ? 'Finish Workout' : `Finish (${loggedSets}/${totalSets} sets)`}
        </button>
      </div>

      {/* Rest timer overlay (RestTimer renders null when inactive) */}
      <RestTimer />

      {/* Summary modal */}
      {showSummary && (
        <WorkoutSummary
          sessionId={sessionId}
          onClose={() => router.push('/today')}
        />
      )}

      {/* Leave confirm dialog */}
      {confirmLeave && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center p-4">
          <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] w-full max-w-sm p-5 space-y-4">
            <p className="font-semibold">Leave workout?</p>
            <p className="text-sm text-[#888888]">Your session is saved. You can return to continue it from the Today tab.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 py-3 rounded-xl border border-[#2a2a2a] text-sm font-semibold"
              >
                Stay
              </button>
              <button
                onClick={() => router.back()}
                className="flex-1 py-3 rounded-xl bg-[#f97316] text-white text-sm font-semibold"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
