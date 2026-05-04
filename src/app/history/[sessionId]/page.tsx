'use client'
import { useParams, useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Calendar, ChevronLeft, Clock, Trophy } from 'lucide-react'
import { weightLabel } from '@/lib/weight'

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = Number(params.sessionId)

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return null

    const logs = await db.setLogs.where('sessionId').equals(sessionId).sortBy('setNumber')

    // Group logs by exerciseId, preserving order of first appearance
    const exerciseOrder: number[] = []
    const byExercise = new Map<number, typeof logs>()
    for (const log of logs) {
      if (!log.isWarmup) {
        if (!byExercise.has(log.exerciseId)) {
          exerciseOrder.push(log.exerciseId)
          byExercise.set(log.exerciseId, [])
        }
        byExercise.get(log.exerciseId)!.push(log)
      }
    }

    const exercises = await Promise.all(
      exerciseOrder.map(async id => {
        const exercise = await db.exercises.get(id)
        return { exercise: exercise!, logs: byExercise.get(id)! }
      })
    )

    const duration = session.completedAt
      ? Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)
      : null

    return { session, exercises, duration }
  }, [sessionId])

  if (!data) return null
  const { session, exercises, duration } = data

  return (
    <div className="py-6 space-y-4 pb-24">
      {/* Back */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-[#888888]">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1 className="text-xl font-bold">Workout {session.workoutLabel}</h1>
          {session.weekNumber && (
            <p className="text-xs text-[#888888]">Week {session.weekNumber}</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-[#888888]">
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {new Date(session.startedAt).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          })}
        </span>
        {duration !== null && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {duration} min
          </span>
        )}
      </div>

      {/* Session note */}
      {session.notes && (
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3">
          <p className="text-xs text-[#888888] mb-1">Session note</p>
          <p className="text-sm">{session.notes}</p>
        </div>
      )}

      {/* Exercises */}
      {exercises.length === 0 ? (
        <p className="text-[#888888] text-sm text-center py-8">No sets logged</p>
      ) : (
        exercises.map(({ exercise, logs }) => (
          <div key={exercise.id} className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <p className="text-sm font-semibold">{exercise.name}</p>
            </div>
            <div className="divide-y divide-[#2a2a2a]/50">
              {logs.map((log, i) => (
                <div key={log.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className="w-6 text-center text-[#888888] text-xs">{i + 1}</span>
                  <span className="flex-1 tabular-nums">
                    {log.weightKg !== null
                      ? `${log.weightKg} ${weightLabel(exercise.equipmentType)}`
                      : 'BW'}
                  </span>
                  <span className="tabular-nums text-[#888888]">{log.reps} reps</span>
                  {log.isPR && (
                    <span className="flex items-center gap-1 text-xs text-[#22c55e] font-semibold">
                      <Trophy size={12} /> PR
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
