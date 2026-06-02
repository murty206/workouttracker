'use client'
import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { db } from '@/lib/db'
import {
  applyProgression,
  detectMismatches,
  type PerformanceMismatch,
} from '@/lib/progression'
import type { SetLog, Exercise, PersonalRecord } from '@/types'

interface Props {
  sessionId: number
  onClose: () => void
}

type Choice = 'planned' | 'actual'

export function WorkoutSummary({ sessionId, onClose }: Props) {
  const [prs, setPRs] = useState<Array<{ record: PersonalRecord; exercise: Exercise }>>([])
  const [totalVolume, setTotalVolume] = useState(0)
  const [duration, setDuration] = useState('')
  const [note, setNote] = useState('')
  const [mismatches, setMismatches] = useState<PerformanceMismatch[]>([])
  const [choices, setChoices] = useState<Record<number, Choice>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const session = await db.sessions.get(sessionId)
      if (session?.startedAt && session?.completedAt) {
        const mins = Math.round(
          (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000
        )
        setDuration(`${mins} min`)
      }

      const logs: SetLog[] = await db.setLogs.where('sessionId').equals(sessionId).toArray()
      const vol = logs.reduce((sum, l) => sum + (l.weightKg ?? 0) * l.reps, 0)
      setTotalVolume(Math.round(vol))

      const prLogs = logs.filter(l => l.isPR)
      const prData = await Promise.all(
        prLogs.map(async l => {
          const record = await db.personalRecords
            .where('setLogId').equals(l.id!).first()
          const exercise = await db.exercises.get(l.exerciseId)
          return record && exercise ? { record, exercise } : null
        })
      )
      setPRs(prData.filter(Boolean) as Array<{ record: PersonalRecord; exercise: Exercise }>)

      const ms = await detectMismatches(sessionId)
      setMismatches(ms)
      const initial: Record<number, Choice> = {}
      for (const m of ms) initial[m.exerciseId] = 'planned'
      setChoices(initial)
    }
    load()
  }, [sessionId])

  async function handleDone() {
    if (saving) return
    setSaving(true)
    if (note.trim()) {
      await db.sessions.update(sessionId, { notes: note.trim() })
    }
    const overrides = new Map<number, number>()
    for (const m of mismatches) {
      if (choices[m.exerciseId] === 'actual') {
        overrides.set(m.exerciseId, m.actualMedianKg)
      }
    }
    await applyProgression(sessionId, overrides.size ? overrides : undefined)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
      <div className="bg-[#1a1a1a] rounded-t-3xl p-6 w-full max-w-lg mx-auto border-t border-[#2a2a2a] max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#f97316]/20 flex items-center justify-center mx-auto mb-3">
            <Trophy size={32} className="text-[#f97316]" />
          </div>
          <h2 className="text-2xl font-bold">Workout Complete!</h2>
        </div>

        <div className="flex gap-4 mb-6">
          <div className="flex-1 bg-[#242424] rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-[#f97316]">{duration}</p>
            <p className="text-xs text-[#888888] mt-1">Duration</p>
          </div>
          <div className="flex-1 bg-[#242424] rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-[#f97316]">{totalVolume.toLocaleString()}</p>
            <p className="text-xs text-[#888888] mt-1">Total Volume (kg)</p>
          </div>
        </div>

        {prs.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">New Personal Records</p>
            <div className="space-y-2">
              {prs.map(({ record, exercise }) => (
                <div key={record.id} className="flex items-center gap-3 bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl px-3 py-2">
                  <Trophy size={16} className="text-[#22c55e] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{exercise.name}</p>
                    <p className="text-xs text-[#888888]">{record.weightKg} kg × {record.reps} reps</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mismatches.length > 0 && (
          <div className="mb-6">
            <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">Adjust next week?</p>
            <div className="space-y-2">
              {mismatches.map(m => {
                const choice = choices[m.exerciseId] ?? 'planned'
                return (
                  <div key={m.exerciseId} className="bg-[#242424] border border-[#2a2a2a] rounded-xl p-3">
                    <p className="text-sm font-medium">{m.exerciseName}</p>
                    <p className="text-xs text-[#888888] mt-0.5">
                      Planned <span className="text-[#f5f5f5]">{m.plannedWeightKg} kg</span>,
                      you lifted <span className="text-[#f5f5f5]">{m.actualMedianKg} kg</span>
                    </p>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setChoices(c => ({ ...c, [m.exerciseId]: 'actual' }))}
                        className={
                          'flex-1 text-xs font-semibold py-2 rounded-lg border ' +
                          (choice === 'actual'
                            ? 'bg-[#f97316] text-white border-[#f97316]'
                            : 'bg-transparent text-[#888888] border-[#2a2a2a]')
                        }
                      >
                        Set baseline {m.actualMedianKg} kg
                      </button>
                      <button
                        onClick={() => setChoices(c => ({ ...c, [m.exerciseId]: 'planned' }))}
                        className={
                          'flex-1 text-xs font-semibold py-2 rounded-lg border ' +
                          (choice === 'planned'
                            ? 'bg-[#2a2a2a] text-[#f5f5f5] border-[#2a2a2a]'
                            : 'bg-transparent text-[#888888] border-[#2a2a2a]')
                        }
                      >
                        Keep {m.plannedWeightKg} kg
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-4">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="How did it go? (optional)"
            rows={2}
            className="w-full bg-[#242424] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-[#555555] outline-none resize-none focus:border-[#f97316]"
          />
        </div>

        <button
          onClick={handleDone}
          disabled={saving}
          className="w-full bg-[#f97316] text-white font-semibold py-4 rounded-2xl disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  )
}
