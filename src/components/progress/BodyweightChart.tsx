'use client'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import type { BodyweightLog } from '@/types'

export function BodyweightChart({ logs }: { logs: BodyweightLog[] }) {
  const data = logs.map(l => ({ date: l.loggedAt, weight: l.weightKg }))

  return (
    <ResponsiveContainer width="100%" height={150}>
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
        <YAxis tick={{ fill: '#888888', fontSize: 10 }} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
          labelStyle={{ color: '#888888', fontSize: 11 }}
          itemStyle={{ color: '#22c55e' }}
          formatter={(v) => [`${v} kg`, 'Body weight']}
          labelFormatter={d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ fill: '#22c55e', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
