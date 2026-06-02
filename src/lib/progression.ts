import { db } from '@/lib/db'
import type { EquipmentType, ProgressionResult } from '@/types'

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

export function evaluatePerformance(
  totalReps: number,
  plannedSets: number,
  repScheme: RepScheme
): ProgressionResult {
  const { lower, upper, isAmrap } = repScheme

  if (isAmrap) {
    // Open-ended scheme ("5+"): no hard upper. Use 1.5× lower as a soft cap
    // so a clearly above-target session still triggers INCREASE.
    const effectiveUpper = Math.round(lower * 1.5)
    const targetMax = effectiveUpper * plannedSets
    const targetMin = lower * plannedSets * 0.8
    if (totalReps >= targetMax) return 'INCREASE'
    if (totalReps < targetMin) return 'DECREASE'
    return 'SAME'
  }

  const effectiveUpper = upper ?? lower
  const targetMax = effectiveUpper * plannedSets
  const targetMin = lower * plannedSets * 0.8

  if (totalReps >= targetMax) return 'INCREASE'
  if (totalReps < targetMin) return 'DECREASE'
  return 'SAME'
}

// Median of a list of working-set weights. Pure, exported for testing.
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export interface PerformanceMismatch {
  exerciseId: number
  exerciseName: string
  plannedWeightKg: number
  actualMedianKg: number
}

// Find exercises in a finished session where the user's actual median
// working weight diverged from the planned weight. Used to prompt the
// user in WorkoutSummary so a deliberate weight bump (or drop) carries
// forward into next week instead of silently snapping back.
export async function detectMismatches(sessionId: number): Promise<PerformanceMismatch[]> {
  const session = await db.sessions.get(sessionId)
  if (!session?.workoutTemplateId) return []

  const tes = await db.templateExercises
    .where('workoutTemplateId').equals(session.workoutTemplateId)
    .toArray()

  const result: PerformanceMismatch[] = []

  for (const te of tes) {
    if (te.plannedWeightKg === null) continue
    const exercise = await db.exercises.get(te.exerciseId)
    if (!exercise || exercise.equipmentType === 'bodyweight') continue

    const logs = await db.setLogs
      .where('sessionId').equals(sessionId)
      .filter(l => l.exerciseId === te.exerciseId && !l.isWarmup && l.weightKg !== null)
      .toArray()

    if (logs.length === 0) continue

    const med = median(logs.map(l => l.weightKg!))
    if (Math.abs(med - te.plannedWeightKg) > 0.01) {
      result.push({
        exerciseId: te.exerciseId,
        exerciseName: exercise.name,
        plannedWeightKg: te.plannedWeightKg,
        actualMedianKg: Math.round(med * 100) / 100,
      })
    }
  }

  return result
}

export async function applyProgression(
  sessionId: number,
  baselineOverrides?: Map<number, number>,
): Promise<void> {
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
      .filter(l => l.exerciseId === te.exerciseId && !l.isWarmup)
      .toArray()

    if (logs.length === 0) continue

    const totalReps = logs.reduce((sum, l) => sum + l.reps, 0)
    const result = evaluatePerformance(totalReps, te.plannedSets, scheme)
    const override = baselineOverrides?.get(te.exerciseId)

    // Without an override, SAME means nothing to write.
    if (result === 'SAME' && override === undefined) continue

    const nextTe = nextTemplateExercises.find(x => x.exerciseId === te.exerciseId)
    if (!nextTe) continue

    // Use the override (auto-regulated baseline) when present so an
    // increase/decrease applies on top of what the user actually lifted.
    const basis = override ?? (te.plannedWeightKg ?? 0)
    const delta = result === 'INCREASE' ? exercise.incrementKg
      : result === 'DECREASE' ? -exercise.incrementKg
      : 0
    const nextWeight = Math.max(0, Math.round((basis + delta) * 100) / 100)
    const nextWarmups = computeWarmupWeights(nextWeight, exercise.equipmentType)

    await db.templateExercises.update(nextTe.id!, {
      plannedWeightKg: nextWeight,
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
