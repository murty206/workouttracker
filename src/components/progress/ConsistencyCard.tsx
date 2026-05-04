'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { consistencyStats } from '@/lib/streak'

export function ConsistencyCard() {
  const stats = useLiveQuery(async () => {
    await db.sessions.toArray() // trigger reactivity
    return consistencyStats()
  }, [])

  if (!stats) return null

  return (
    <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 space-y-4">
      <p className="text-sm font-semibold">Consistency</p>

      <div className="flex items-end gap-1">
        <p className="text-5xl font-bold text-[#f97316]">{stats.percent}%</p>
        <p className="text-xs text-[#888888] mb-1.5">last 4 weeks</p>
      </div>

      <div className="w-full bg-[#242424] rounded-full h-2">
        <div
          className="bg-[#f97316] h-2 rounded-full transition-all"
          style={{ width: `${stats.percent}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[#242424] rounded-xl p-2 text-center">
          <p className="text-lg font-bold">{stats.currentStreak}</p>
          <p className="text-xs text-[#888888]">Current streak</p>
        </div>
        <div className="bg-[#242424] rounded-xl p-2 text-center">
          <p className="text-lg font-bold">{stats.longestStreak}</p>
          <p className="text-xs text-[#888888]">Longest streak</p>
        </div>
        <div className="bg-[#242424] rounded-xl p-2 text-center">
          <p className="text-lg font-bold">{stats.sessionsLast4Weeks}<span className="text-xs text-[#888888] font-normal">/{stats.expectedLast4Weeks}</span></p>
          <p className="text-xs text-[#888888]">Sessions</p>
        </div>
      </div>
    </div>
  )
}
