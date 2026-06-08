import { db } from '@/lib/db'
import type { EquipmentType, ProgressionResult } from '@/types'

// ─── Warmup tiers ─────────────────────────────────────────────────────────────

// Compute warmup weights from the working weight using fixed tiers.
// Rounded DOWN to the nearest step so a beginner never warms up heavier
// than intended (step = 5 kg for machines, 2.5 kg for everything else).
export function computeWarmupWeights(
  workingKg: number,
  equipmentType: EquipmentType,
): number[] {
  if (equipmentType === 'bodyweight') return []
  if (workingKg < 10) return []

  let fractions: number[]
  if (workingKg >= 40) fractions = [0.4, 0.6, 0.8]
  else if (workingKg >= 20) fractions = [0.5, 0.75]
  else fractions = [0.5]

  const step = equipmentType === 'machine' ? 5 : 2.5
  return fractions.map(f => Math.floor((workingKg * f) / step) * step)
}

// ─── Rep scheme parsing ───────────────────────────────────────────────────────

export interface RepScheme {
  lower: number
  upper: number | null
  isAmrap: boolean
}

export function parseRepScheme(reps: string): RepScheme | null {
  if (reps === 'max') return null
  if (reps.endsWith('+')) {
    const lower = parseInt(reps)
    return { lower, upper: null, isAmrap: true }
  }
  if (reps.includes('-')) {
    const [l, u] = reps.split('-').map(Number)
    return { lower: l, upper: u, isAmrap: false }
  }
  const n = parseInt(reps)
  return { lower: n, upper: n, isAmrap: false }
}

// ─── Performance evaluation ───────────────────────────────────────────────────

// Standard scheme rules (per-set, with overshooting bonus):
//   • worst set < lower                          → DECREASE
//   • every set ≥ upper AND ≥2 sets strictly >   → INCREASE_2
//   • every set ≥ upper                          → INCREASE
//   • otherwise                                  → SAME
//
// AMRAP scheme rules (last set is the "as many as possible" set):
//   • last set < lower                           → DECREASE
//   • last set ≥ 2× lower                        → INCREASE_2
//   • last set ≥ 1.5× lower                      → INCREASE
//   • otherwise                                  → SAME
export function evaluatePerformance(
  setReps: number[],
  repScheme: RepScheme,
): ProgressionResult {
  if (setReps.length === 0) return 'SAME'
  const { lower, upper, isAmrap } = repScheme

  if (isAmrap) {
    const lastSet = setReps[setReps.length - 1]
    if (lastSet < lower) return 'DECREASE'
    if (lastSet >= lower * 2) return 'INCREASE_2'
    if (lastSet >= lower * 1.5) return 'INCREASE'
    return 'SAME'
  }

  const effectiveUpper = upper ?? lower
  const worst = Math.min(...setReps)
  if (worst < lower) return 'DECREASE'

  const allHitUpper = setReps.every(r => r >= effectiveUpper)
  if (allHitUpper) {
    const setsOverUpper = setReps.filter(r => r > effectiveUpper).length
    if (setsOverUpper >= 2) return 'INCREASE_2'
    return 'INCREASE'
  }
  return 'SAME'
}

// ─── Median ───────────────────────────────────────────────────────────────────

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

// ─── Pure progression decision ────────────────────────────────────────────────

// % jump above which dumbbell exercises require a second confirmation
// before bumping. 15 % is the line that flags 5 → 7.5 (+50 %) as risky
// but lets 25 → 27.5 (+10 %) bump normally.
const DUMBBELL_DOUBLE_CONFIRM_PCT = 0.15

export interface ProgressionDecision {
  nextWeightKg: number
  readyForBump: boolean
  justBumped: boolean
  // For diagnostics / future UI hints. Not currently surfaced.
  reason: 'no-change' | 'increase' | 'increase-2' | 'decrease' | 'bump-confirmed' | 'awaiting-confirmation' | 'grace'
}

export interface ProgressionInput {
  basisKg: number
  result: ProgressionResult
  incrementKg: number
  equipmentType: EquipmentType
  readyForBump: boolean
  justBumped: boolean
}

export function decideProgression(input: ProgressionInput): ProgressionDecision {
  const { basisKg, result, incrementKg, equipmentType, readyForBump, justBumped } = input
  const round = (w: number) => Math.max(0, Math.round(w * 100) / 100)

  // DECREASE with a fresh bump → soak one session at the higher weight.
  if (result === 'DECREASE' && justBumped) {
    return {
      nextWeightKg: round(basisKg),
      readyForBump: false,
      justBumped: false,
      reason: 'grace',
    }
  }

  if (result === 'DECREASE') {
    return {
      nextWeightKg: round(basisKg - incrementKg),
      readyForBump: false,
      justBumped: false,
      reason: 'decrease',
    }
  }

  if (result === 'SAME') {
    // Hitting the middle of the range does not count as a bump confirmation —
    // any held "ready" flag is cleared.
    return {
      nextWeightKg: round(basisKg),
      readyForBump: false,
      justBumped: false,
      reason: 'no-change',
    }
  }

  // INCREASE or INCREASE_2
  const steps = result === 'INCREASE_2' ? 2 : 1
  const delta = incrementKg * steps
  const pctJump = basisKg > 0 ? delta / basisKg : Infinity

  const needsDoubleConfirm =
    equipmentType === 'dumbbell' && pctJump > DUMBBELL_DOUBLE_CONFIRM_PCT

  if (needsDoubleConfirm && !readyForBump) {
    return {
      nextWeightKg: round(basisKg),
      readyForBump: true,
      justBumped: false,
      reason: 'awaiting-confirmation',
    }
  }

  return {
    nextWeightKg: round(basisKg + delta),
    readyForBump: false,
    justBumped: needsDoubleConfirm, // grace only when the jump was risky
    reason: needsDoubleConfirm
      ? 'bump-confirmed'
      : steps === 2 ? 'increase-2' : 'increase',
  }
}

// ─── DB orchestration ─────────────────────────────────────────────────────────

export async function applyProgression(sessionId: number): Promise<void> {
  const session = await db.sessions.get(sessionId)
  if (!session?.workoutTemplateId || !session.weekNumber || !session.programId) return

  const currentTemplate = await db.workoutTemplates.get(session.workoutTemplateId)
  if (!currentTemplate) return

  const nextWeek = await db.programWeeks
    .where('[programId+weekNumber]')
    .equals([session.programId, session.weekNumber + 1])
    .first()
  if (!nextWeek) return

  const nextTemplate = await db.workoutTemplates
    .where('programWeekId').equals(nextWeek.id!)
    .filter(t => t.label === currentTemplate.label)
    .first()
  if (!nextTemplate) return

  const templateExercises = await db.templateExercises
    .where('workoutTemplateId').equals(session.workoutTemplateId)
    .toArray()

  const nextTemplateExercises = await db.templateExercises
    .where('workoutTemplateId').equals(nextTemplate.id!)
    .toArray()

  for (const te of templateExercises) {
    const exercise = await db.exercises.get(te.exerciseId)
    if (!exercise || exercise.equipmentType === 'bodyweight') continue

    const scheme = parseRepScheme(te.plannedReps)
    if (!scheme) continue

    const logs = await db.setLogs
      .where('sessionId').equals(sessionId)
      .filter(l => l.exerciseId === te.exerciseId && !l.isWarmup && l.weightKg !== null)
      .toArray()

    if (logs.length === 0) continue

    const setReps = logs.map(l => l.reps)
    const result = evaluatePerformance(setReps, scheme)
    const basis = median(logs.map(l => l.weightKg!))

    const decision = decideProgression({
      basisKg: basis,
      result,
      incrementKg: exercise.incrementKg,
      equipmentType: exercise.equipmentType,
      readyForBump: exercise.readyForBump ?? false,
      justBumped: exercise.justBumped ?? false,
    })

    // Persist flag transitions on the exercise so they carry across weeks.
    if (
      (exercise.readyForBump ?? false) !== decision.readyForBump ||
      (exercise.justBumped ?? false) !== decision.justBumped
    ) {
      await db.exercises.update(exercise.id!, {
        readyForBump: decision.readyForBump,
        justBumped: decision.justBumped,
      })
    }

    const nextTe = nextTemplateExercises.find(x => x.exerciseId === te.exerciseId)
    if (!nextTe) continue

    const nextWarmups = computeWarmupWeights(decision.nextWeightKg, exercise.equipmentType)
    await db.templateExercises.update(nextTe.id!, {
      plannedWeightKg: decision.nextWeightKg,
      warmupWeights: nextWarmups,
    })
  }
}

// Copy this template's planned weights into the next-week same-label template
// without modification. Use when a session is skipped so prior progression
// (already written into the current-week template) carries forward.
export async function carryForwardWeights(
  programId: number,
  weekNumber: number,
  templateId: number,
  label: 'A' | 'B' | 'C',
): Promise<void> {
  const nextWeek = await db.programWeeks
    .where('[programId+weekNumber]')
    .equals([programId, weekNumber + 1])
    .first()
  if (!nextWeek) return

  const nextTemplate = await db.workoutTemplates
    .where('programWeekId').equals(nextWeek.id!)
    .filter(t => t.label === label)
    .first()
  if (!nextTemplate) return

  const templateExercises = await db.templateExercises
    .where('workoutTemplateId').equals(templateId)
    .toArray()

  const nextTemplateExercises = await db.templateExercises
    .where('workoutTemplateId').equals(nextTemplate.id!)
    .toArray()

  for (const te of templateExercises) {
    if (te.plannedWeightKg === null) continue
    const nextTe = nextTemplateExercises.find(x => x.exerciseId === te.exerciseId)
    if (!nextTe) continue
    const exercise = await db.exercises.get(te.exerciseId)
    if (!exercise) continue
    const warmups = computeWarmupWeights(te.plannedWeightKg, exercise.equipmentType)
    await db.templateExercises.update(nextTe.id!, {
      plannedWeightKg: te.plannedWeightKg,
      warmupWeights: warmups,
    })
  }
}
