import { db } from '@/lib/db'

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

export async function detectAndSavePR(
  exerciseId: number,
  weightKg: number | null,
  reps: number,
  sessionId: number,
  setLogId: number
): Promise<boolean> {
  if (weightKg === null || weightKg === 0) return false

  const newE1RM = epley(weightKg, reps)

  const existing = await db.personalRecords
    .where('exerciseId').equals(exerciseId)
    .toArray()
  const bestE1RM = existing.reduce((max, pr) => Math.max(max, pr.estimatedOneRepMax), 0)

  if (newE1RM <= bestE1RM) return false

  // Intra-session dedup: a session should hold at most one PR record for
  // each exercise. If a prior set in this session already produced one,
  // replace it in place rather than stacking records.
  const sessionPR = existing.find(pr => pr.sessionId === sessionId)
  if (sessionPR) {
    await db.personalRecords.update(sessionPR.id!, {
      weightKg,
      reps,
      estimatedOneRepMax: newE1RM,
      achievedAt: new Date().toISOString(),
      setLogId,
    })
    if (sessionPR.setLogId !== setLogId) {
      await db.setLogs.update(sessionPR.setLogId, { isPR: false })
    }
    return true
  }

  await db.personalRecords.add({
    exerciseId,
    weightKg,
    reps,
    estimatedOneRepMax: newE1RM,
    achievedAt: new Date().toISOString(),
    sessionId,
    setLogId,
  })
  return true
}

// Rebuild the personalRecords table and setLogs.isPR flags for one exercise
// by replaying all working sets in chronological order. Use after editing
// or deleting a setLog so PR state stays consistent with the underlying logs.
export async function rebuildPRsForExercise(exerciseId: number): Promise<void> {
  const existing = await db.personalRecords
    .where('exerciseId').equals(exerciseId)
    .toArray()
  await Promise.all(existing.map(pr => db.personalRecords.delete(pr.id!)))

  const logs = await db.setLogs
    .where('exerciseId').equals(exerciseId)
    .filter(l => !l.isWarmup && l.weightKg !== null && l.weightKg > 0)
    .sortBy('loggedAt')

  let bestE1RM = 0
  for (const log of logs) {
    const e1rm = epley(log.weightKg!, log.reps)
    if (e1rm > bestE1RM) {
      bestE1RM = e1rm
      await db.personalRecords.add({
        exerciseId,
        weightKg: log.weightKg,
        reps: log.reps,
        estimatedOneRepMax: e1rm,
        achievedAt: log.loggedAt,
        sessionId: log.sessionId,
        setLogId: log.id!,
      })
      if (!log.isPR) {
        await db.setLogs.update(log.id!, { isPR: true })
      }
    } else if (log.isPR) {
      await db.setLogs.update(log.id!, { isPR: false })
    }
  }
}
