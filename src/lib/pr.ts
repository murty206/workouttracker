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

  const best = await db.personalRecords
    .where('exerciseId').equals(exerciseId)
    .sortBy('estimatedOneRepMax')
  const bestE1RM = best.at(-1)?.estimatedOneRepMax ?? 0

  if (newE1RM <= bestE1RM) return false

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
