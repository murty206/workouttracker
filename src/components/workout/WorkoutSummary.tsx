'use client'
import { useEffect, useState } from 'react'
import { Trophy } from 'lucide-react'
import { db } from '@/lib/db'
import type { SetLog, Exercise, PersonalRecord } from '@/types'

interface Props {
  sessionId: number
  onClose: () => void
}

export function WorkoutSummary({ sessionId, onClose }: Props) {
  const [prs, setPRs] = useState<Array<{ record: PersonalRecord; exercise: Exercise }>>([])
  const [totalVolume, setTotalVolume] = useState(0)
  const [duration, setDuration] = useState('')
  const [note, setNote] = useState('')

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
    }
    load()
  }, [sessionId])

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
          onClick={async () => {
            if (note.trim()) {
              await db.sessions.update(sessionId, { notes: note.trim() })
            }
            onClose()
          }}
          className="w-full bg-[#f97316] text-white font-semibold py-4 rounded-2xl"
        >
          Done
        </button>
      </div>
    </div>
  )
}
