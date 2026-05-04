import { db } from '@/lib/db'

export function epley(weight: number, reps: number): number {
  if (reps === 1) return weight
  return weight * (1 + reps / 30)
}

export async function bestE1RM(exerciseId: number, repCap = 10): Promise<number | null> {
  const logs = await db.setLogs
    .where('sessionId').above(0)
    .filter(l => l.exerciseId === exerciseId && !l.isWarmup && l.weightKg !== null && l.reps >= 1 && l.reps <= repCap)
    .toArray()

  if (!logs.length) return null

  let best = 0
  for (const log of logs) {
    const e1rm = epley(log.weightKg!, log.reps)
    if (e1rm > best) best = e1rm
  }
  return best
}

export async function bestE1RMForSession(exerciseId: number, sessionId: number, repCap = 10): Promise<number | null> {
  const logs = await db.setLogs
    .where('sessionId').equals(sessionId)
    .filter(l => l.exerciseId === exerciseId && !l.isWarmup && l.weightKg !== null && l.reps >= 1 && l.reps <= repCap)
    .toArray()

  if (!logs.length) return null

  let best = 0
  for (const log of logs) {
    const e1rm = epley(log.weightKg!, log.reps)
    if (e1rm > best) best = e1rm
  }
  return best
}

function dotsCoeff(bw: number, gender: 'male' | 'female'): number {
  if (gender === 'male') {
    return 500 / (
      -307.75076
      + 24.0900756 * bw
      - 0.1918759221 * bw ** 2
      + 0.0007391293 * bw ** 3
      - 0.000001093 * bw ** 4
    )
  } else {
    return 500 / (
      -57.96288
      + 13.6175032 * bw
      - 0.1126655495 * bw ** 2
      + 0.0005158568 * bw ** 3
      - 0.0000010706 * bw ** 4
    )
  }
}

export function dotsScore(totalLiftedKg: number, bodyweightKg: number, gender: 'male' | 'female'): number {
  return dotsCoeff(bodyweightKg, gender) * totalLiftedKg
}

const LIFT_NAMES = ['Bench Press', 'Squat', 'Over Head Press', 'Barbell Row'] as const
type LiftName = typeof LIFT_NAMES[number]

export interface StrengthScore {
  total: number
  breakdown: Record<LiftName, number | null>
}

export async function strengthScore(gender: 'male' | 'female', bodyweightKg: number): Promise<StrengthScore> {
  const breakdown: Record<string, number | null> = {}
  let total = 0

  for (const name of LIFT_NAMES) {
    const exercise = await db.exercises.where('name').equals(name).first()
    if (!exercise) {
      breakdown[name] = null
      continue
    }

    const e1rm = await bestE1RM(exercise.id!, 10)
    if (e1rm === null) {
      breakdown[name] = null
      continue
    }

    // Barbell: total lifted = e1rm per side × 2 + 20 kg bar
    const totalLifted = e1rm * 2 + 20
    const dots = dotsScore(totalLifted, bodyweightKg, gender)
    breakdown[name] = Math.round(dots * 10) / 10
    total += dots
  }

  return { total: Math.round(total * 10) / 10, breakdown: breakdown as Record<LiftName, number | null> }
}
