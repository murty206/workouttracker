'use client'
import { useEffect, useState } from 'react'
import { Trophy, SkipForward, X, MoreHorizontal } from 'lucide-react'
import { db } from '@/lib/db'
import { detectAndSavePR, rebuildPRsForExercise } from '@/lib/pr'
import { useWorkoutStore } from '@/store/workoutStore'
import { formatWeight, weightLabel } from '@/lib/weight'
import { plateBreakdownLabel } from '@/lib/plates'
import { cn } from '@/lib/utils'
import type { TemplateExercise, Exercise, SetLog } from '@/types'
import { SetRow } from './SetRow'

type LogEntry = { logId: number; weight: number | null; reps: number }

interface Props {
  te: TemplateExercise
  exercise: Exercise
  sessionLogs: SetLog[]
  sessionId: number
  onSetLogged: () => void
}

export function ExerciseCard({ te, exercise, sessionLogs, sessionId, onSetLogged }: Props) {
  const [skipped, setSkipped] = useState(false)
  const [confirmSkip, setConfirmSkip] = useState(false)
  const [logMenu, setLogMenu] = useState<LogEntry | null>(null)
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null)

  const prExerciseId = useWorkoutStore(s => s.prExerciseId)
  const startTimer = useWorkoutStore(s => s.startTimer)
  const flashPR = useWorkoutStore(s => s.flashPR)

  const workingSets = sessionLogs.filter(l => !l.isWarmup)
  const warmupLogs = sessionLogs.filter(l => l.isWarmup)
  const warmupBySetNumber = new Map(warmupLogs.map(l => [l.setNumber, l]))
  const isPR = prExerciseId === exercise.id
  const setsLeft = te.plannedSets - workingSets.length
  const allSetsLogged = setsLeft <= 0

  // Lifted weight/reps state so the plate breakdown can react to what the
  // user is actually about to lift, not just the planned weight.
  const initialWeight = workingSets.at(-1)?.weightKg ?? te.plannedWeightKg
  const [currentWeight, setCurrentWeight] = useState<string>(
    initialWeight !== null ? initialWeight.toString() : ''
  )
  const [currentReps, setCurrentReps] = useState<string>(
    (parseInt(te.plannedReps) || 8).toString()
  )

  // Setup note: sticky across sessions for exercises that need it. Default to
  // the most recent setupNote on any logged set for this exercise.
  const [setupNote, setSetupNote] = useState<string>('')
  useEffect(() => {
    if (!exercise.requiresSetupNote) return
    const existingFromSession = sessionLogs.find(l => l.setupNote)?.setupNote
    if (existingFromSession) {
      setSetupNote(existingFromSession)
      return
    }
    let cancelled = false
    db.setLogs
      .where('exerciseId').equals(exercise.id!)
      .filter(l => !!l.setupNote)
      .reverse()
      .sortBy('loggedAt')
      .then(logs => {
        if (cancelled) return
        const prev = logs[0]?.setupNote
        if (prev) setSetupNote(prev)
      })
    return () => { cancelled = true }
  }, [exercise.id, exercise.requiresSetupNote, sessionLogs])

  const parsedWeight = parseFloat(currentWeight)
  const plateBreakdown = exercise.equipmentType === 'barbell' && !isNaN(parsedWeight) && parsedWeight > 0
    ? plateBreakdownLabel(parsedWeight)
    : null

  async function handleLogSet(weight: number | null, reps: number) {
    const setNumber = workingSets.length + 1
    const trimmedSetupNote = exercise.requiresSetupNote ? setupNote.trim() : ''
    const setLogId = await db.setLogs.add({
      sessionId,
      exerciseId: exercise.id!,
      setNumber,
      weightKg: weight,
      reps,
      isWarmup: false,
      isPR: false,
      loggedAt: new Date().toISOString(),
      ...(trimmedSetupNote ? { setupNote: trimmedSetupNote } : {}),
    })
    if (weight !== null) {
      const isNewPR = await detectAndSavePR(exercise.id!, weight, reps, sessionId, setLogId as number)
      if (isNewPR) {
        await db.setLogs.update(setLogId as number, { isPR: true })
        flashPR(exercise.id!)
      }
    }
    if (weight !== null) setCurrentWeight(weight.toString())
    setCurrentReps(reps.toString())
    startTimer(exercise.restSeconds)
    onSetLogged()
  }

  async function handleDeleteLog(logId: number) {
    const log = await db.setLogs.get(logId)
    if (!log) return
    await db.setLogs.delete(logId)
    if (!log.isWarmup) await rebuildPRsForExercise(log.exerciseId)
    setLogMenu(null)
    onSetLogged()
  }

  async function handleEditLog(logId: number, weight: number | null, reps: number) {
    const log = await db.setLogs.get(logId)
    if (!log) return
    await db.setLogs.update(logId, { weightKg: weight, reps })
    if (!log.isWarmup) await rebuildPRsForExercise(log.exerciseId)
    setEditingLog(null)
    onSetLogged()
  }

  if (skipped) {
    return (
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3 flex items-center justify-between opacity-60">
        <p className="text-sm text-[#888888]">{exercise.name} <span className="text-xs">— skipped</span></p>
        <button onClick={() => setSkipped(false)} className="text-xs text-[#f97316]">Undo</button>
      </div>
    )
  }

  return (
    <div className={cn(
      'bg-[#1a1a1a] rounded-2xl border overflow-hidden',
      isPR ? 'border-[#22c55e]' : 'border-[#2a2a2a]'
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-base leading-tight">{exercise.name}</h3>
              {isPR && (
                <span className="flex items-center gap-1 text-xs text-[#22c55e] font-semibold">
                  <Trophy size={12} /> PR!
                </span>
              )}
              {allSetsLogged && (
                <span className="text-xs text-[#f97316] font-semibold">Done ✓</span>
              )}
            </div>
            {exercise.notes && (
              <p className="text-xs text-[#888888] italic mt-0.5">{exercise.notes}</p>
            )}
            <p className="text-sm text-[#888888] mt-0.5">
              {te.plannedSets} × {te.plannedReps}
              {exercise.equipmentType !== 'bodyweight' && te.plannedWeightKg !== null && (
                <span className="ml-2 text-[#f97316]">
                  {formatWeight(te.plannedWeightKg, exercise.equipmentType)}
                </span>
              )}
            </p>
            {plateBreakdown && (
              <p className="text-xs text-[#888888] mt-0.5">Plates/side: {plateBreakdown}</p>
            )}
          </div>

          {/* Skip */}
          {!allSetsLogged && (
            <div className="shrink-0">
              {!confirmSkip ? (
                <button
                  onClick={() => setConfirmSkip(true)}
                  className="flex items-center gap-1 text-xs text-[#888888] border border-[#2a2a2a] rounded-lg px-2 py-1"
                >
                  <SkipForward size={12} />
                  Skip
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSkipped(true)}
                    className="text-xs bg-[#444444] text-white px-2 py-1 rounded-lg"
                  >
                    Confirm
                  </button>
                  <button onClick={() => setConfirmSkip(false)} className="text-[#888888]">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Setup note (e.g. inverted row bar height) */}
      {exercise.requiresSetupNote && (
        <div className="px-4 pb-3 border-t border-[#2a2a2a] pt-3">
          <input
            type="text"
            value={setupNote}
            onChange={e => setSetupNote(e.target.value)}
            placeholder="Setup note (e.g. bar height: chest)"
            className="w-full bg-[#242424] text-sm text-[#f5f5f5] placeholder-[#555555] rounded-lg px-3 py-2 border border-[#2a2a2a] focus:border-[#f97316] outline-none"
          />
        </div>
      )}

      {/* Warmup checklist */}
      {te.warmupWeights.length > 0 && (
        <div className="px-4 pb-3 border-t border-[#2a2a2a] pt-3">
          <p className="text-xs text-[#888888] mb-2">Warmup</p>
          <div className="flex flex-wrap gap-2">
            {te.warmupWeights.map((w, i) => {
              const setNumber = i + 1
              const existingLog = warmupBySetNumber.get(setNumber)
              const done = !!existingLog
              return (
                <button
                  key={i}
                  onClick={async () => {
                    if (existingLog) {
                      await db.setLogs.delete(existingLog.id!)
                    } else {
                      await db.setLogs.add({
                        sessionId,
                        exerciseId: exercise.id!,
                        setNumber,
                        weightKg: w,
                        reps: 5,
                        isWarmup: true,
                        isPR: false,
                        loggedAt: new Date().toISOString(),
                      })
                    }
                    onSetLogged()
                  }}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border transition-colors',
                    done
                      ? 'bg-[#f97316]/20 border-[#f97316] text-[#f97316] line-through'
                      : 'bg-[#242424] border-[#2a2a2a] text-[#888888]'
                  )}
                >
                  {formatWeight(w, exercise.equipmentType)} × 5
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Working sets */}
      <div className="border-t border-[#2a2a2a]">
        {/* Long-press action menu */}
        {logMenu && (
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
                onClick={() => handleDeleteLog(logMenu.logId)}
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

        {workingSets.map((log, i) => {
          if (editingLog?.logId === log.id) {
            return (
              <InlineEditRow
                key={log.id}
                entry={editingLog!}
                exercise={exercise}
                onSave={handleEditLog}
                onCancel={() => setEditingLog(null)}
              />
            )
          }
          return (
            <div
              key={log.id}
              className="px-4 py-2.5 flex items-center gap-3 text-sm border-b border-[#2a2a2a]/50"
            >
              <span className="w-6 text-center text-[#888888] text-xs">{i + 1}</span>
              <span className="flex-1 text-[#f5f5f5] tabular-nums">
                {log.weightKg !== null ? `${log.weightKg} ${weightLabel(exercise.equipmentType)}` : 'BW'}
              </span>
              <span className="text-[#f5f5f5] tabular-nums">{log.reps} reps</span>
              {log.isPR && <Trophy size={14} className="text-[#22c55e]" />}
              <button
                onClick={() => setLogMenu(
                  logMenu?.logId === log.id ? null : { logId: log.id!, weight: log.weightKg, reps: log.reps }
                )}
                className="text-[#888888] p-1 -mr-1"
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
          )
        })}

        {!allSetsLogged && (
          <SetRow
            setNumber={workingSets.length + 1}
            exercise={exercise}
            weight={currentWeight}
            reps={currentReps}
            onWeightChange={setCurrentWeight}
            onRepsChange={setCurrentReps}
            onLog={handleLogSet}
          />
        )}
      </div>
    </div>
  )
}

function InlineEditRow({
  entry,
  exercise,
  onSave,
  onCancel,
}: {
  entry: LogEntry
  exercise: Exercise
  onSave: (id: number, weight: number | null, reps: number) => void
  onCancel: () => void
}) {
  const isBodyweight = exercise.equipmentType === 'bodyweight'
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
