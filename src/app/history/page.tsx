'use client'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Calendar, ChevronRight, Clock, Dumbbell } from 'lucide-react'

export default function HistoryPage() {
  const sessions = useLiveQuery(async () => {
    const all = await db.sessions
      .filter(s => s.completedAt !== null && !s.skipped)
      .sortBy('startedAt')
    return all.reverse()
  }, [], [])

  if (!sessions) return <div className="py-6 text-center text-[#888888]">Loading…</div>
  if (sessions.length === 0) {
    return (
      <div className="py-20 text-center space-y-2">
        <Dumbbell size={40} className="text-[#2a2a2a] mx-auto" />
        <p className="text-[#888888]">No workouts yet</p>
        <p className="text-xs text-[#888888]">Start your first session on the Today tab</p>
      </div>
    )
  }

  return (
    <div className="py-6 space-y-3">
      <h1 className="text-2xl font-bold mb-4">History</h1>
      {sessions.map(session => {
        const date = new Date(session.startedAt)
        const duration = session.completedAt
          ? Math.round((new Date(session.completedAt).getTime() - date.getTime()) / 60000)
          : null

        return (
          <Link key={session.id} href={`/history/${session.id}`} className="block bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold">Workout {session.workoutLabel}</span>
                  {session.weekNumber && (
                    <span className="text-xs text-[#888888] bg-[#242424] px-2 py-0.5 rounded-full">
                      Week {session.weekNumber}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[#888888]">
                  <span className="flex items-center gap-1">
                    <Calendar size={11} />
                    {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {duration !== null && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {duration} min
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-[#f97316]">{session.workoutLabel}</span>
                <ChevronRight size={16} className="text-[#444444]" />
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
