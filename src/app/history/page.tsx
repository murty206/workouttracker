'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { Calendar, ChevronRight, Clock, Dumbbell, MoreHorizontal, X } from 'lucide-react'

export default function HistoryPage() {
  const [deleteMenu, setDeleteMenu] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sessions = useLiveQuery(async () => {
    const all = await db.sessions
      .filter(s => s.completedAt !== null && !s.skipped)
      .sortBy('startedAt')
    return all.reverse()
  }, [], [])

  async function handleDelete(sessionId: number) {
    setDeleting(true)
    const logs = await db.setLogs.where('sessionId').equals(sessionId).toArray()
    const prLogIds = logs.filter(l => l.isPR).map(l => l.id!)
    if (prLogIds.length > 0) {
      await db.personalRecords
        .filter(pr => prLogIds.includes(pr.setLogId))
        .delete()
    }
    await db.setLogs.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
    setDeleteMenu(null)
    setDeleting(false)
  }

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
          <div key={session.id} className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
            {/* Delete confirm */}
            {deleteMenu === session.id && (
              <div className="px-4 py-3 bg-[#242424] border-b border-[#2a2a2a] flex items-center justify-between gap-2">
                <p className="text-xs text-[#888888] flex-1">Delete this session?</p>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleDelete(session.id!)}
                    disabled={deleting}
                    className="text-xs bg-[#ef4444] text-white px-3 py-1 rounded-lg"
                  >
                    {deleting ? '…' : 'Delete'}
                  </button>
                  <button onClick={() => setDeleteMenu(null)} className="text-[#888888] px-1">
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center">
              <Link href={`/history/${session.id}`} className="flex-1 px-4 py-3">
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
              <button
                onClick={() => setDeleteMenu(deleteMenu === session.id ? null : session.id!)}
                className="pr-4 pl-1 py-3 text-[#888888]"
              >
                <MoreHorizontal size={18} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
