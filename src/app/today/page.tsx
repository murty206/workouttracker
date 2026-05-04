'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { Dumbbell, SkipForward, Scale, Pencil } from 'lucide-react'
import { db } from '@/lib/db'
import Link from 'next/link'
import { getTodaysTemplate, getProgramProgress, startSession, skipSession, getInProgressSession } from '@/lib/program'
import { formatWeight } from '@/lib/weight'
import type { WorkoutTemplate, TemplateExercise, Exercise } from '@/types'
import { BodyweightModal } from '@/components/today/BodyweightModal'
import { ProgramCompleteScreen } from '@/components/today/ProgramCompleteScreen'

interface TemplateWithExercises {
  template: WorkoutTemplate
  exercises: Array<{ te: TemplateExercise; exercise: Exercise }>
}

export default function TodayPage() {
  const router = useRouter()
  const [data, setData] = useState<TemplateWithExercises | null>(null)
  const [progress, setProgress] = useState<Awaited<ReturnType<typeof getProgramProgress>> | null>(null)
  const [isComplete, setIsComplete] = useState(false)
  const [showBodyweight, setShowBodyweight] = useState(false)
  const [starting, setStarting] = useState(false)
  const [inProgressId, setInProgressId] = useState<number | null>(null)

  const sessions = useLiveQuery(() => db.sessions.toArray(), [])
  const programCount = useLiveQuery(() => db.programs.count(), [])

  useEffect(() => {
    async function load() {
      const inProgress = await getInProgressSession()
      setInProgressId(inProgress?.id ?? null)

      const prog = await getProgramProgress()
      setProgress(prog)
      setIsComplete(prog.isComplete)

      if (!prog.isComplete) {
        const template = await getTodaysTemplate()
        if (template) {
          const tes = await db.templateExercises
            .where('workoutTemplateId').equals(template.id!)
            .sortBy('orderInWorkout')
          const exercises = await Promise.all(
            tes.map(async te => {
              const exercise = await db.exercises.get(te.exerciseId)
              return { te, exercise: exercise! }
            })
          )
          setData({ template, exercises })
        }
      }
    }
    load()
  }, [sessions, programCount])

  async function handleStart() {
    if (inProgressId) {
      router.push(`/workout/${inProgressId}`)
      return
    }
    if (!data || !progress) return
    setStarting(true)
    const sessionId = await startSession(data.template.id!, progress.weekNumber, progress.workoutLabel)
    router.push(`/workout/${sessionId}`)
  }

  async function handleSkip() {
    if (!data || !progress) return
    await skipSession(data.template.id!, progress.weekNumber, progress.workoutLabel)
  }

  if (isComplete) return <ProgramCompleteScreen />

  const weekLabel = progress?.weekNumber === 13 ? 'Rest Week' : `Week ${progress?.weekNumber ?? '…'} of 12`
  const sessionLabel = progress ? `Workout ${progress.workoutLabel}` : '…'
  const progressPct = progress ? Math.min(100, (progress.completedCount / progress.totalSessions) * 100) : 0

  return (
    <div className="py-6 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#888888] text-sm">{weekLabel}</p>
            <h1 className="text-2xl font-bold">{sessionLabel}</h1>
          </div>
          <button
            onClick={() => setShowBodyweight(true)}
            className="flex items-center gap-1.5 text-[#888888] text-sm border border-[#2a2a2a] rounded-full px-3 py-1.5 hover:border-[#f97316] hover:text-[#f97316] transition-colors"
          >
            <Scale size={14} />
            Log weight
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mt-3">
          <div
            className="h-full bg-[#f97316] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-xs text-[#888888]">
          {progress?.completedCount ?? 0} of {progress?.totalSessions ?? 39} sessions completed
        </p>
      </div>

      {/* Exercise preview */}
      {data && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2a2a2a] flex items-center justify-between">
            <p className="text-xs text-[#888888] uppercase tracking-wider">Today&apos;s Exercises</p>
            <Link
              href={`/program/edit/${progress?.workoutLabel ?? 'A'}`}
              className="flex items-center gap-1 text-xs text-[#888888]"
            >
              <Pencil size={12} />
              Edit workout
            </Link>
          </div>
          <div className="divide-y divide-[#2a2a2a]">
            {data.exercises.map(({ te, exercise }) => (
              <div key={te.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{exercise.name}</p>
                  <p className="text-xs text-[#888888] mt-0.5">
                    {te.plannedSets} sets × {te.plannedReps}
                  </p>
                </div>
                {exercise.equipmentType !== 'bodyweight' && te.plannedWeightKg !== null && (
                  <span className="text-[#f97316] text-sm font-semibold">
                    {formatWeight(te.plannedWeightKg, exercise.equipmentType)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        <button
          onClick={handleStart}
          disabled={!inProgressId && (!data || starting)}
          className="w-full bg-[#f97316] text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95 transition-transform text-lg"
        >
          <Dumbbell size={22} />
          {inProgressId ? 'Resume Workout' : starting ? 'Starting…' : 'Start Workout'}
        </button>

        {data && (
          <button
            onClick={handleSkip}
            className="w-full flex items-center justify-center gap-2 text-[#888888] text-sm py-2"
          >
            <SkipForward size={16} />
            Skip this session
          </button>
        )}
      </div>

      <BodyweightModal open={showBodyweight} onClose={() => setShowBodyweight(false)} />
    </div>
  )
}
