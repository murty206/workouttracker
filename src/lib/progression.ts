import { db } from '@/lib/db'
import type { ProgressionResult, TemplateExercise } from '@/types'

interface RepScheme {
  lower: number
  upper: number | null
}

export function parseRepScheme(reps: string): RepScheme | null {
  if (reps === 'max') return null
  if (reps.endsWith('+')) {
    const lower = parseInt(reps)
    return { lower, upper: null }
  }
  if (reps.includes('-')) {
    const [l, u] = reps.split('-').map(Number)
    return { lower: l, upper: u }
  }
  const n = parseInt(reps)
  return { lower: n, upper: n }
}

export function evaluatePerformance(
  totalReps: number,
  plannedSets: number,
  repScheme: RepScheme
): ProgressionResult {
  const { lower, upper } = repScheme
  const effectiveUpper = upper ?? Math.round(lower * 1.5)

  const targetMax = effectiveUpper * plannedSets
  const targetMin = lower * plannedSets * 0.8

  if (totalReps >= targetMax) return 'INCREASE'
  if (totalReps < targetMin) return 'DECREASE'
  return 'SAME'
}

export async function applyProgression(sessionId: number): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session?.workoutTemplateId) return

  const templateExercises = await db.templateExercises
    .where('workoutTemplateId').equals(session.workoutTemplateId)
    .toArray()

  for (const te of templateExercises) {
    const exercise = await db.exercises.get(te.exerciseId)
    if (!exercise || exercise.equipmentType === 'bodyweight') continue

    const scheme = parseRepScheme(te.plannedReps)
    if (!scheme) continue

    const logs = await db.setLogs
      .where('sessionId').equals(sessionId)
      .filter(l => l.exerciseId === te.exerciseId && !l.isWarmup)
      .toArray()

    if (logs.length === 0) continue

    const totalReps = logs.reduce((sum, l) => sum + l.reps, 0)
    const result = evaluatePerformance(totalReps, te.plannedSets, scheme)

    if (result === 'SAME') continue

    const currentWeight = te.plannedWeightKg ?? 0
    const delta = result === 'INCREASE' ? exercise.incrementKg : -exercise.incrementKg
    const nextWeight = Math.max(0, Math.round((currentWeight + delta) * 100) / 100)

    await db.templateExercises.update(te.id!, { plannedWeightKg: nextWeight })
  }
}
