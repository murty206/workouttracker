'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { weeklyVolume } from '@/lib/volume'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

export function VolumeChart() {
  const data = useLiveQuery(async () => {
    const logs = await db.setLogs.toArray()
    return weeklyVolume(logs)
  }, [])

  if (!data || data.length < 2) return null

  return (
    <ResponsiveContainer width="100%" height={150}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
        <XAxis
          dataKey="weekStart"
          tick={{ fill: '#888888', fontSize: 10 }}
          tickFormatter={d => {
            const dt = new Date(d)
            return `${dt.getDate()}/${dt.getMonth() + 1}`
          }}
        />
        <YAxis
          tick={{ fill: '#888888', fontSize: 10 }}
          tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`}
        />
        <Tooltip
          contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 }}
          labelStyle={{ color: '#888888', fontSize: 11 }}
          itemStyle={{ color: '#f97316' }}
          formatter={(v) => [`${(v as number).toLocaleString()} kg`, 'Weekly volume']}
          labelFormatter={d => `Week of ${new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
        />
        <Line
          type="monotone"
          dataKey="volume"
          stroke="#f97316"
          strokeWidth={2}
          dot={{ fill: '#f97316', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
