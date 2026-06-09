'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, SkipForward, Circle, Dot } from 'lucide-react'
import { db } from '@/lib/db'
import { getProgramProgress } from '@/lib/program'
import { formatWeight } from '@/lib/weight'
import { totalVolume } from '@/lib/volume'
import type { ProgramWeek, WorkoutTemplate, TemplateExercise, Exercise, Session, SetLog } from '@/types'

type WorkoutStatus = 'completed' | 'skipped' | 'current' | 'upcoming'

interface TemplateView {
  template: WorkoutTemplate
  exercises: { te: TemplateExercise; exercise: Exercise }[]
  status: WorkoutStatus
  session?: Session
  sessionVolume?: number
}

interface WeekView {
  week: ProgramWeek
  isDeload: boolean
  templates: TemplateView[]
}

export default function ProgramOverviewPage() {
  const data = useLiveQuery(async () => {
    const program = await db.programs.where('isActive').equals(1).first()
    if (!program) return null

    const progress = await getProgramProgress()
    const weeks = await db.programWeeks
      .where('programId').equals(program.id!)
      .sortBy('weekNumber')

    const allSessions = await db.sessions.toArray()
    const sessionByTemplateId = new Map<number, Session>()
    for (const s of allSessions) {
      if (s.workoutTemplateId != null) sessionByTemplateId.set(s.workoutTemplateId, s)
    }

    const weekViews: WeekView[] = []
    for (const week of weeks) {
      const isDeload = week.weekNumber > program.totalWeeks
      const templates = await db.workoutTemplates
        .where('programWeekId').equals(week.id!)
        .sortBy('orderInWeek')

      const templateViews: TemplateView[] = []
      for (const template of templates) {
        const tes = await db.templateExercises
          .where('workoutTemplateId').equals(template.id!)
          .sortBy('orderInWorkout')
        const exercises = await Promise.all(
          tes.map(async te => {
            const exercise = await db.exercises.get(te.exerciseId)
            return { te, exercise: exercise! }
          })
        )

        const session = sessionByTemplateId.get(template.id!)
        let status: WorkoutStatus
        if (session?.completedAt && !session.skipped) status = 'completed'
        else if (session?.skipped) status = 'skipped'
        else if (week.weekNumber === progress.weekNumber && template.label === progress.workoutLabel)
          status = 'current'
        else status = 'upcoming'

        let sessionVolume: number | undefined
        if (status === 'completed' && session?.id) {
          const logs = await db.setLogs.where('sessionId').equals(session.id).toArray()
          const vol = Math.round(totalVolume(logs))
          if (vol > 0) sessionVolume = vol
        }

        templateViews.push({ template, exercises, status, session, sessionVolume })
      }

      weekViews.push({ week, isDeload, templates: templateViews })
    }

    const expectedSessionsPerWeek = 3
    const totalWeeksLabel = program.totalWeeks
    const startDate = program.startDate ? new Date(program.startDate) : null
    let estimatedEndDate: Date | null = null
    if (startDate) {
      const totalWeeks = program.totalWeeks + 1 // training + deload
      estimatedEndDate = new Date(startDate.getTime() + totalWeeks * 7 * 24 * 3600 * 1000)
    }

    return {
      program,
      progress,
      weekViews,
      expectedSessionsPerWeek,
      totalWeeksLabel,
      startDate,
      estimatedEndDate,
    }
  }, [])

  // Current week defaults expanded; users can fold/unfold the rest.
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(new Set())
  const currentWeek = data?.progress.weekNumber
  useEffect(() => {
    if (currentWeek === undefined) return
    setOpenWeeks(prev => (prev.size === 0 ? new Set([currentWeek]) : prev))
  }, [currentWeek])

  if (!data) {
    return (
      <div className="py-6 text-center text-sm text-[#888888]">
        Loading program…
      </div>
    )
  }

  const { program, progress, weekViews, totalWeeksLabel, startDate, estimatedEndDate } = data
  const progressPct = Math.min(100, (progress.completedCount / progress.totalSessions) * 100)

  function toggleWeek(n: number) {
    setOpenWeeks(prev => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  return (
    <div className="py-6 space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-[#888888]">
          <ChevronLeft size={24} />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Program Overview</h1>
          <p className="text-xs text-[#888888]">{program.name}</p>
        </div>
      </div>

      {/* Status card */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-[#888888]">
            {progress.isComplete
              ? 'Program complete'
              : progress.weekNumber > totalWeeksLabel
              ? 'Deload week'
              : `Week ${progress.weekNumber} of ${totalWeeksLabel}`}
          </p>
          {!progress.isComplete && (
            <p className="text-sm text-[#f97316] font-semibold">Workout {progress.workoutLabel}</p>
          )}
        </div>
        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div className="h-full bg-[#f97316] rounded-full" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-xs text-[#888888]">
          <span>{progress.completedCount} of {progress.totalSessions} sessions completed</span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        {(startDate || estimatedEndDate) && (
          <div className="flex items-center justify-between text-xs text-[#888888] pt-2 border-t border-[#2a2a2a]">
            <span>
              Started {startDate ? formatDate(startDate) : '—'}
            </span>
            <span>
              {estimatedEndDate ? `Est. end ${formatDate(estimatedEndDate)}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Weekly accordion */}
      <div className="space-y-2">
        {weekViews.map(({ week, isDeload, templates }) => {
          const open = openWeeks.has(week.weekNumber)
          const completedInWeek = templates.filter(t => t.status === 'completed').length
          const skippedInWeek = templates.filter(t => t.status === 'skipped').length
          return (
            <div key={week.id} className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
              <button
                onClick={() => toggleWeek(week.weekNumber)}
                className="w-full px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {open ? <ChevronDown size={18} className="text-[#888888]" /> : <ChevronRight size={18} className="text-[#888888]" />}
                  <div className="text-left min-w-0">
                    <p className="text-sm font-semibold">
                      {isDeload ? 'Deload Week' : `Week ${week.weekNumber}`}
                    </p>
                    <p className="text-xs text-[#888888] mt-0.5">
                      {completedInWeek > 0 && <span>{completedInWeek} done</span>}
                      {completedInWeek > 0 && skippedInWeek > 0 && <span> · </span>}
                      {skippedInWeek > 0 && <span>{skippedInWeek} skipped</span>}
                      {completedInWeek === 0 && skippedInWeek === 0 && (
                        week.weekNumber === progress.weekNumber ? 'In progress' : 'Upcoming'
                      )}
                    </p>
                  </div>
                </div>
              </button>
              {open && (
                <div className="border-t border-[#2a2a2a] divide-y divide-[#2a2a2a]">
                  {templates.map(t => (
                    <TemplateCard key={t.template.id} view={t} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TemplateCard({ view }: { view: TemplateView }) {
  const { template, exercises, status, sessionVolume } = view
  const StatusIcon = status === 'completed' ? CheckCircle2
    : status === 'skipped' ? SkipForward
    : status === 'current' ? Dot
    : Circle
  const statusColor = status === 'completed' ? 'text-[#22c55e]'
    : status === 'skipped' ? 'text-[#888888]'
    : status === 'current' ? 'text-[#f97316]'
    : 'text-[#444444]'
  const statusLabel = status === 'completed' ? 'Completed'
    : status === 'skipped' ? 'Skipped'
    : status === 'current' ? 'Current'
    : 'Upcoming'

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon size={16} className={statusColor} />
          <p className="text-sm font-semibold">Workout {template.label}</p>
          <span className={`text-[10px] uppercase tracking-wider ${statusColor}`}>{statusLabel}</span>
        </div>
        {sessionVolume !== undefined && (
          <p className="text-xs text-[#888888] tabular-nums">{sessionVolume.toLocaleString()} kg</p>
        )}
      </div>
      <div className="divide-y divide-[#2a2a2a]/40">
        {exercises.map(({ te, exercise }) => (
          <div key={te.id} className={`py-1.5 flex items-center justify-between gap-3 ${status === 'skipped' ? 'opacity-50' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm truncate">{exercise.name}</p>
              <p className="text-xs text-[#888888]">
                {exercise.equipmentType === 'cardio'
                  ? `${te.cardioDurationMin ?? '—'} min · ${te.cardioInclinePct ?? '—'}% · ${te.cardioSpeedKmh ?? '—'} km/h`
                  : `${te.plannedSets} × ${te.plannedReps}`}
              </p>
            </div>
            {exercise.equipmentType !== 'bodyweight' && exercise.equipmentType !== 'cardio' && te.plannedWeightKg !== null && (
              <p className="text-xs text-[#f97316] tabular-nums shrink-0">
                {formatWeight(te.plannedWeightKg, exercise.equipmentType)}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
