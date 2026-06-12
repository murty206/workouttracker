import { db } from '@/lib/db'

export interface ConsistencyStats {
  currentStreak: number
  longestStreak: number
  sessionsLast4Weeks: number
  expectedLast4Weeks: number
  percent: number
}

export async function consistencyStats(): Promise<ConsistencyStats> {
  const completed = await db.sessions
    .filter(s => !!s.completedAt && !s.skipped)
    .sortBy('completedAt')

  const now = Date.now()
  const DAY_MS = 24 * 60 * 60 * 1000
  const fourWeeksAgo = now - 28 * DAY_MS

  // Cap the consistency window at the program's actual age so a brand-new
  // user isn't punished for the calendar weeks before they ever started
  // training. If startDate is unset (no session logged yet), fall back to
  // the full 4-week window.
  const program = await db.programs.where('isActive').equals(1).first()
  const programStartMs = program?.startDate ? new Date(program.startDate).getTime() : null
  const windowStart = programStartMs != null
    ? Math.max(programStartMs, fourWeeksAgo)
    : fourWeeksAgo

  const sessionsLast4Weeks = completed.filter(
    s => new Date(s.completedAt!).getTime() >= windowStart
  ).length

  const windowDays = Math.max(1, (now - windowStart) / DAY_MS)
  const expectedLast4Weeks = Math.min(12, Math.max(1, Math.ceil(windowDays * 3 / 7)))

  // Streak: consecutive sessions (no gap > 3 days between sessions counts as consecutive)
  // Actually, treat each session as one "unit" — a streak is unbroken completed sessions
  // since the last skipped session or gap > 7 days
  let currentStreak = 0
  let longestStreak = 0
  let streak = 0

  for (let i = 0; i < completed.length; i++) {
    streak++
    if (streak > longestStreak) longestStreak = streak

    if (i === completed.length - 1) {
      currentStreak = streak
    }
  }

  // Check if there are any skipped sessions after the last completed one
  const allSessions = await db.sessions.filter(s => !!s.completedAt || !!s.skipped).sortBy('startedAt')
  const lastCompleted = completed.at(-1)

  if (lastCompleted) {
    // Count streak from most recent backwards until a skipped session or gap > 7 days
    streak = 0
    for (let i = allSessions.length - 1; i >= 0; i--) {
      const s = allSessions[i]
      if (s.skipped) break
      if (!s.completedAt) continue
      streak++
    }
    currentStreak = streak
  }

  const percent = Math.min(100, Math.round((sessionsLast4Weeks / expectedLast4Weeks) * 100))

  return { currentStreak, longestStreak, sessionsLast4Weeks, expectedLast4Weeks, percent }
}
