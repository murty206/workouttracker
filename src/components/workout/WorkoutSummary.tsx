'use client'
import { useEffect, useState } from 'react'
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react'
import { db } from '@/lib/db'
import { totalVolume } from '@/lib/volume'
import type { SetLog, Exercise, PRType, Session } from '@/types'

interface BaseProps {
  sessionId: number
}

interface PostWorkoutProps extends BaseProps {
  mode?: 'post-workout'
  onClose: () => void
}

interface HistoryProps extends BaseProps {
  mode: 'history'
  onClose?: never
}

type Props = PostWorkoutProps | HistoryProps

interface PRGroup {
  exercise: Exercise
  weightKg: number | null
  reps: number
  types: PRType[]
}

interface SummaryData {
  session: Session | undefined
  durationLabel: string
  volume: number
  workingSetCount: number
  prs: PRGroup[]
  comparison: {
    prevSession: Session
    prevVolume: number
    deltaPct: number
  } | null
}

export function WorkoutSummary(props: Props) {
  const { sessionId } = props
  const mode = props.mode ?? 'post-workout'

  const [data, setData] = useState<SummaryData | null>(null)
  const [note, setNote] = useState('')
  const [kcal, setKcal] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [maxHr, setMaxHr] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const session = await db.sessions.get(sessionId)
        if (!session) {
          setData({
            session: undefined,
            durationLabel: '',
            volume: 0,
            workingSetCount: 0,
            prs: [],
            comparison: null,
          })
          return
        }

        const durationLabel = session.startedAt && session.completedAt
          ? `${Math.round(
              (new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000,
            )} min`
          : ''

        const logs: SetLog[] = await db.setLogs.where('sessionId').equals(sessionId).toArray()
        const volume = Math.round(totalVolume(logs))
        const workingSetCount = logs.filter(l => !l.isWarmup).length

        // sessionId is not indexed on personalRecords — use filter() instead
        // of where().equals(), which throws SchemaError on non-indexed paths.
        const sessionPRs = await db.personalRecords.filter(pr => pr.sessionId === sessionId).toArray()
        const groups = new Map<number, PRGroup>()
        for (const pr of sessionPRs) {
          const exercise = await db.exercises.get(pr.exerciseId)
          if (!exercise) continue
          const existing = groups.get(pr.setLogId)
          if (existing) {
            existing.types.push(pr.prType)
          } else {
            groups.set(pr.setLogId, {
              exercise,
              weightKg: pr.weightKg,
              reps: pr.reps,
              types: [pr.prType],
            })
          }
        }

        // Same-label comparison: find the most recent prior completed session
        // with the same workoutLabel. Sort ascending and take the last element
        // — Dexie's .reverse().sortBy() doesn't compose the way you'd expect
        // (sortBy resorts and undoes the reverse intent).
        let comparison: SummaryData['comparison'] = null
        const priorSameLabel = await db.sessions
          .where('startedAt').below(session.startedAt)
          .filter(s =>
            s.workoutLabel === session.workoutLabel &&
            !!s.completedAt &&
            !s.skipped &&
            s.id !== session.id,
          )
          .sortBy('startedAt')
        const prev = priorSameLabel[priorSameLabel.length - 1]
        if (prev?.id) {
          const prevLogs = await db.setLogs.where('sessionId').equals(prev.id).toArray()
          const prevVolume = Math.round(totalVolume(prevLogs))
          if (prevVolume > 0 && volume > 0) {
            comparison = {
              prevSession: prev,
              prevVolume,
              deltaPct: Math.round(((volume - prevVolume) / prevVolume) * 100),
            }
          }
        }

        setData({
          session,
          durationLabel,
          volume,
          workingSetCount,
          prs: Array.from(groups.values()),
          comparison,
        })
        setNote(session.notes ?? '')
        setKcal(session.caloriesKcal != null ? String(session.caloriesKcal) : '')
        setAvgHr(session.avgHr != null ? String(session.avgHr) : '')
        setMaxHr(session.maxHr != null ? String(session.maxHr) : '')
      } catch (err) {
        console.error('WorkoutSummary load failed:', err)
        setData({
          session: undefined,
          durationLabel: '',
          volume: 0,
          workingSetCount: 0,
          prs: [],
          comparison: null,
        })
      }
    }
    load()
  }, [sessionId])

  function parseNullableInt(s: string): number | null {
    const trimmed = s.trim()
    if (!trimmed) return null
    const n = parseInt(trimmed, 10)
    return Number.isNaN(n) ? null : n
  }

  async function persistHistoryField(patch: Partial<Session>) {
    if (mode !== 'history') return
    await db.sessions.update(sessionId, patch)
  }

  if (!data) return mode === 'post-workout' ? null : (
    <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-6 text-center text-xs text-[#888888]">
      Loading summary…
    </div>
  )

  const { session, durationLabel, volume, workingSetCount, prs, comparison } = data
  const labelLine = session
    ? `Workout ${session.workoutLabel}${session.weekNumber ? ` · Week ${session.weekNumber}` : ''}`
    : ''

  const summaryBody = (
    <>
      <div className="flex gap-3 mb-4">
        <Stat label="Duration" value={durationLabel || '—'} />
        <Stat label="Volume (kg)" value={volume.toLocaleString()} />
        <Stat label="Sets" value={workingSetCount.toString()} />
      </div>

      {comparison && (
        <ComparisonRow
          deltaPct={comparison.deltaPct}
          prevVolume={comparison.prevVolume}
          prevWeek={comparison.prevSession.weekNumber}
          workoutLabel={comparison.prevSession.workoutLabel}
        />
      )}

      {prs.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">
            {prs.length} Personal Record{prs.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-2">
            {prs.map((g, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl px-3 py-2"
              >
                <Trophy size={16} className="text-[#22c55e] shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{g.exercise.name}</p>
                    {g.types.map(t => (
                      <span
                        key={t}
                        className="text-[10px] uppercase tracking-wider text-[#22c55e] border border-[#22c55e]/40 rounded px-1.5 py-0.5"
                      >
                        {t === 'strength' ? 'Strength' : 'Reps'}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-[#888888] mt-0.5">
                    {g.weightKg !== null ? `${g.weightKg} kg × ` : ''}{g.reps} reps
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">Watch data</p>
        <div className="grid grid-cols-3 gap-2">
          <WatchField
            label="kcal"
            value={kcal}
            onChange={setKcal}
            onBlur={() => persistHistoryField({ caloriesKcal: parseNullableInt(kcal) })}
            max={9999}
          />
          <WatchField
            label="Avg HR"
            value={avgHr}
            onChange={setAvgHr}
            onBlur={() => persistHistoryField({ avgHr: parseNullableInt(avgHr) })}
            max={250}
          />
          <WatchField
            label="Max HR"
            value={maxHr}
            onChange={setMaxHr}
            onBlur={() => persistHistoryField({ maxHr: parseNullableInt(maxHr) })}
            max={250}
          />
        </div>
      </div>
    </>
  )

  if (mode === 'history') {
    return (
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4">
        <p className="text-xs text-[#888888] uppercase tracking-wider mb-3">Session summary</p>
        {summaryBody}
        <div className="mt-4 pt-4 border-t border-[#2a2a2a]">
          <p className="text-xs text-[#888888] mb-1">Session note</p>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            onBlur={() => persistHistoryField({ notes: note.trim() ? note.trim() : undefined })}
            placeholder="How did it go? (optional)"
            rows={3}
            className="w-full bg-[#242424] border border-[#2a2a2a] rounded-xl px-3 py-2.5 text-sm text-[#f5f5f5] placeholder-[#555555] outline-none resize-y focus:border-[#f97316]"
          />
        </div>
      </div>
    )
  }

  // post-workout modal
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end">
      <div className="bg-[#1a1a1a] rounded-t-3xl p-6 w-full max-w-lg mx-auto border-t border-[#2a2a2a] max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full bg-[#f97316]/20 flex items-center justify-center mx-auto mb-3">
            <Trophy size={32} className="text-[#f97316]" />
          </div>
          <h2 className="text-2xl font-bold">Workout Complete!</h2>
          {labelLine && <p className="text-sm text-[#888888] mt-1">{labelLine}</p>}
        </div>

        {summaryBody}

        <div className="mt-6 mb-4">
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
            await db.sessions.update(sessionId, {
              notes: note.trim() || undefined,
              caloriesKcal: parseNullableInt(kcal),
              avgHr: parseNullableInt(avgHr),
              maxHr: parseNullableInt(maxHr),
            })
            ;(props as PostWorkoutProps).onClose()
          }}
          className="w-full bg-[#f97316] text-white font-semibold py-4 rounded-2xl"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function WatchField({
  label,
  value,
  onChange,
  onBlur,
  max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  max: number
}) {
  return (
    <div className="bg-[#242424] rounded-xl px-2.5 py-2 border border-[#2a2a2a] focus-within:border-[#f97316]">
      <p className="text-[10px] text-[#888888] uppercase tracking-wider">{label}</p>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onFocus={e => e.target.select()}
        placeholder="—"
        className="w-full bg-transparent text-base font-semibold text-[#f5f5f5] placeholder-[#555555] outline-none tabular-nums"
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 bg-[#242424] rounded-xl p-3 text-center">
      <p className="text-xl font-bold text-[#f97316] tabular-nums">{value}</p>
      <p className="text-[10px] text-[#888888] mt-1 uppercase tracking-wider">{label}</p>
    </div>
  )
}

function ComparisonRow({
  deltaPct,
  prevVolume,
  prevWeek,
  workoutLabel,
}: {
  deltaPct: number
  prevVolume: number
  prevWeek: number | null
  workoutLabel: string
}) {
  const positive = deltaPct > 0
  const flat = deltaPct === 0
  const Icon = flat ? null : positive ? TrendingUp : TrendingDown
  const tone = flat
    ? 'text-[#888888] border-[#2a2a2a] bg-[#242424]'
    : positive
    ? 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10'
    : 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10'
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${tone}`}>
      {Icon && <Icon size={16} />}
      <span className="text-sm font-medium">
        {flat ? '±' : positive ? '+' : ''}{deltaPct}% volume
      </span>
      <span className="text-xs text-[#888888] ml-auto">
        vs W{prevWeek ?? '?'} {workoutLabel} ({prevVolume.toLocaleString()} kg)
      </span>
    </div>
  )
}
