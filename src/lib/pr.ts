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
