'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { epley } from '@/lib/score'
import { setVolume } from '@/lib/volume'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

interface Props { exerciseId: number }

export function ExerciseChart({ exerciseId }: Props) {
  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId])
  const isBodyweight = exercise?.equipmentType === 'bodyweight'

  const data = useLiveQuery(async () => {
    if (!exercise) return null

    if (isBodyweight) {
      const logs = await db.setLogs
        .where('exerciseId').equals(exerciseId)
        .filter(l => !l.isWarmup)
        .sortBy('loggedAt')

      const bySession = new Map<number, {
        date: string
        totalReps: number
        bestSet: number
        setCount: number
      }>()

      for (const log of logs) {
        const date = log.loggedAt.split('T')[0]
        const existing = bySession.get(log.sessionId)
        if (!existing) {
          bySession.set(log.sessionId, {
            date,
            totalReps: log.reps,
            bestSet: log.reps,
            setCount: 1,
          })
          continue
        }
        existing.totalReps += log.reps
        existing.setCount += 1
        if (log.reps > existing.bestSet) existing.bestSet = log.reps
      }

      return Array.from(bySession.values()).map(d => ({
        date: d.date,
        totalReps: d.totalReps,
        label: `${d.setCount} sets · best ${d.bestSet}`,
      }))
    }

    const logs = await db.setLogs
      .where('exerciseId').equals(exerciseId)
      .filter(l => !l.isWarmup && l.weightKg !== null)
      .sortBy('loggedAt')

    const bySession = new Map<number, {
      date: string
      e1rm: number
      volume: number
      bestWeight: number
      bestReps: number
    }>()

    for (const log of logs) {
      const date = log.loggedAt.split('T')[0]
      const isE1rmEligible = log.reps >= 1 && log.reps <= 10
      const e1rm = isE1rmEligible ? epley(log.weightKg!, log.reps) : 0
      const vol = setVolume(log)
      const existing = bySession.get(log.sessionId)

      if (!existing) {
        bySession.set(log.sessionId, {
          date,
          e1rm,
          volume: vol,
          bestWeight: log.weightKg!,
          bestReps: log.reps,
        })
        continue
      }

      existing.volume += vol
      if (e1rm > existing.e1rm) {
        existing.e1rm = e1rm
        existing.bestWeight = log.weightKg!
        existing.bestReps = log.reps
      }
    }

    return Array.from(bySession.values()).map(d => ({
      date: d.date,
      e1rm: d.e1rm > 0 ? Math.round(d.e1rm * 10) / 10 : null,
      volume: Math.round(d.volume),
      label: `${d.bestWeight} kg × ${d.bestReps}`,
    }))
  }, [exerciseId, isBodyweight, exercise])

  const prs = useLiveQuery(() =>
    db.personalRecords.where('exerciseId').equals(exerciseId).sortBy('achievedAt'),
    [exerciseId]
  )

  if (!data || data.length === 0) {
    return <p className="text-[#888888] text-sm text-center py-4">No data yet</p>
  }

  if (isBodyweight) {
    const bwData = data as { date: string; totalReps: number; label: string }[]
    const bestTotal = Math.max(...bwData.map(d => d.totalReps))
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">{exercise?.name}</p>
          <p className="text-xs text-[#888888]">Total reps · per session</p>
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={bwData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#888888', fontSize: 10 }}
              tickFormatter={d => {
                const dt = new Date(d)
                return `${dt.getDate()}/${dt.getMonth() + 1}`
              }}
            />
            <YAxis
              tick={{ fill: '#f97316', fontSize: 10 }}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
              labelStyle={{ color: '#888888', fontSize: 11 }}
              formatter={(value, _name, props) => [
                `${value} reps (${props.payload.label})`,
                'Total',
              ]}
              labelFormatter={d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            />
            <Line
              type="monotone"
              dataKey="totalReps"
              stroke="#f97316"
              strokeWidth={2}
              dot={{ fill: '#f97316', r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="flex items-center justify-between text-xs">
          <span className="text-[#888888]">Best session</span>
          <span className="text-[#22c55e] font-semibold">{bestTotal} reps</span>
        </div>
      </div>
    )
  }

  const weightedData = data as { date: string; e1rm: number | null; volume: number; label: string }[]
  const unit = exercise?.weightDisplay === 'total' ? 'kg' : 'kg/side'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{exercise?.name}</p>
        <p className="text-xs text-[#888888]">Est. 1RM · Volume</p>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={weightedData} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#888888', fontSize: 10 }}
            tickFormatter={d => {
              const dt = new Date(d)
              return `${dt.getDate()}/${dt.getMonth() + 1}`
            }}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#f97316', fontSize: 10 }}
            domain={['auto', 'auto']}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#22c55e', fontSize: 10 }}
            tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`}
          />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
            labelStyle={{ color: '#888888', fontSize: 11 }}
            formatter={(value, name, props) => {
              if (name === 'e1rm') {
                if (value === null) return ['—', 'Est. 1RM']
                return [`${value} kg (${props.payload.label})`, 'Est. 1RM']
              }
              return [`${(value as number).toLocaleString()} kg`, 'Volume']
            }}
            labelFormatter={d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#888888' }}
            formatter={(value) => value === 'e1rm' ? 'Est. 1RM' : 'Volume'}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="e1rm"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ fill: '#f97316', r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="volume"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ fill: '#22c55e', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {prs && prs.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#888888]">Best</span>
          <span className="text-[#22c55e] font-semibold">
            {prs.at(-1)?.weightKg} {unit} × {prs.at(-1)?.reps} reps
          </span>
        </div>
      )}
    </div>
  )
}
