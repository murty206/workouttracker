'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { epley } from '@/lib/score'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

interface Props { exerciseId: number }

export function ExerciseChart({ exerciseId }: Props) {
  const exercise = useLiveQuery(() => db.exercises.get(exerciseId), [exerciseId])

  const data = useLiveQuery(async () => {
    const logs = await db.setLogs
      .where('exerciseId').equals(exerciseId)
      .filter(l => !l.isWarmup && l.weightKg !== null && l.reps >= 1 && l.reps <= 10)
      .sortBy('loggedAt')

    // Group by session: take best estimated 1RM per session
    const bySession = new Map<number, { date: string; e1rm: number; weight: number; reps: number }>()
    for (const log of logs) {
      const e1rm = epley(log.weightKg!, log.reps)
      const existing = bySession.get(log.sessionId)
      const date = log.loggedAt.split('T')[0]
      if (!existing || e1rm > existing.e1rm) {
        bySession.set(log.sessionId, { date, e1rm, weight: log.weightKg!, reps: log.reps })
      }
    }

    return Array.from(bySession.values()).map(d => ({
      date: d.date,
      e1rm: Math.round(d.e1rm * 10) / 10,
      label: `${d.weight} kg × ${d.reps}`,
    }))
  }, [exerciseId])

  const prs = useLiveQuery(() =>
    db.personalRecords.where('exerciseId').equals(exerciseId).sortBy('achievedAt'),
    [exerciseId]
  )

  if (!data || data.length === 0) {
    return <p className="text-[#888888] text-sm text-center py-4">No data yet</p>
  }

  const unit = exercise?.weightDisplay === 'total' ? 'kg' : 'kg/side'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{exercise?.name}</p>
        <p className="text-xs text-[#888888]">Est. 1RM (kg)</p>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#888888', fontSize: 10 }}
            tickFormatter={d => {
              const dt = new Date(d)
              return `${dt.getDate()}/${dt.getMonth() + 1}`
            }}
          />
          <YAxis tick={{ fill: '#888888', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
            labelStyle={{ color: '#888888', fontSize: 11 }}
            itemStyle={{ color: '#f97316' }}
            formatter={(v, _name, props) => [
              `${v} kg est. 1RM (${props.payload.label})`,
              'Strength'
            ]}
            labelFormatter={d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          />
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ fill: '#f97316', r: 3 }}
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
