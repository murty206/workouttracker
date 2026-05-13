'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Calendar, ChevronLeft, Clock, Trophy, MoreHorizontal, X } from 'lucide-react'
import { weightLabel } from '@/lib/weight'
import { rebuildPRsForExercise } from '@/lib/pr'

type LogEntry = { logId: number; weight: number | null; reps: number; exerciseId: number }

export default function SessionDetailPage() {
  const params = useParams()
  const router = useRouter()
  const sessionId = Number(params.sessionId)

  const [logMenu, setLogMenu] = useState<LogEntry | null>(null)
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null)

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId)
    if (!session) return null

    const logs = await db.setLogs.where('sessionId').equals(sessionId).sortBy('setNumber')

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

  async function handleDelete(logId: number, exerciseId: number) {
    const log = await db.setLogs.get(logId)
    if (!log) return
    await db.setLogs.delete(logId)
    if (!log.isWarmup) await rebuildPRsForExercise(exerciseId)
    setLogMenu(null)
  }

  async function handleEdit(logId: number, weight: number | null, reps: number) {
    const log = await db.setLogs.get(logId)
    if (!log) return
    await db.setLogs.update(logId, { weightKg: weight, reps })
    if (!log.isWarmup) await rebuildPRsForExercise(log.exerciseId)
    setEditingLog(null)
  }

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

            {/* Action menu */}
            {logMenu && logs.some(l => l.id === logMenu.logId) && (
              <div className="px-4 py-2.5 bg-[#242424] border-b border-[#2a2a2a] flex items-center justify-between gap-2">
                <p className="text-xs text-[#888888] flex-1 truncate">
                  {logMenu.weight !== null ? `${logMenu.weight} ${weightLabel(exercise.equipmentType)}` : 'BW'} × {logMenu.reps} reps
                </p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setEditingLog(logMenu); setLogMenu(null) }}
                    className="text-xs bg-[#f97316] text-white px-3 py-1 rounded-lg"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(logMenu.logId, logMenu.exerciseId)}
                    className="text-xs bg-[#ef4444] text-white px-3 py-1 rounded-lg"
                  >
                    Delete
                  </button>
                  <button onClick={() => setLogMenu(null)} className="text-[#888888] px-1">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-[#2a2a2a]/50">
              {logs.map((log, i) => {
                if (editingLog?.logId === log.id) {
                  return (
                    <InlineEditRow
                      key={log.id}
                      entry={editingLog!}
                      equipmentType={exercise.equipmentType}
                      onSave={handleEdit}
                      onCancel={() => setEditingLog(null)}
                    />
                  )
                }
                return (
                  <div key={log.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                    <span className="w-6 text-center text-[#888888] text-xs">{i + 1}</span>
                    <span className="flex-1 tabular-nums">
                      {log.weightKg !== null ? `${log.weightKg} ${weightLabel(exercise.equipmentType)}` : 'BW'}
                    </span>
                    <span className="tabular-nums text-[#888888]">{log.reps} reps</span>
                    {log.isPR && (
                      <span className="flex items-center gap-1 text-xs text-[#22c55e] font-semibold">
                        <Trophy size={12} /> PR
                      </span>
                    )}
                    <button
                      onClick={() => setLogMenu(
                        logMenu?.logId === log.id ? null : { logId: log.id!, weight: log.weightKg, reps: log.reps, exerciseId: exercise.id! }
                      )}
                      className="text-[#888888] p-1 -mr-1"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function InlineEditRow({
  entry,
  equipmentType,
  onSave,
  onCancel,
}: {
  entry: LogEntry
  equipmentType: string
  onSave: (id: number, weight: number | null, reps: number) => void
  onCancel: () => void
}) {
  const isBodyweight = equipmentType === 'bodyweight'
  const [weight, setWeight] = useState(entry.weight?.toString() ?? '')
  const [reps, setReps] = useState(entry.reps.toString())

  function handleSave() {
    const w = isBodyweight ? null : parseFloat(weight)
    const r = parseInt(reps)
    if (isNaN(r) || r <= 0) return
    if (!isBodyweight && (isNaN(w!) || w! < 0)) return
    onSave(entry.logId, w, r)
  }

  return (
    <div className="px-3 py-2.5 flex items-center gap-2 bg-[#1f1f1f] border-b border-[#2a2a2a]/50">
      {!isBodyweight && (
        <input
          type="number"
          inputMode="decimal"
          onFocus={e => e.target.select()}
          value={weight}
          onChange={e => setWeight(e.target.value)}
          className="w-20 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#f97316] outline-none"
        />
      )}
      <input
        type="number"
        inputMode="numeric"
          onFocus={e => e.target.select()}
        value={reps}
        onChange={e => setReps(e.target.value)}
        className="w-14 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#f97316] outline-none"
      />
      <button onClick={handleSave} className="flex-1 bg-[#f97316] text-white text-xs font-semibold py-2 rounded-lg">
        Save
      </button>
      <button onClick={onCancel} className="text-[#888888]">
        <X size={16} />
      </button>
    </div>
  )
}
