import { db } from '@/lib/db'
import type { ProgressionResult, TemplateExercise } from '@/types'

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
      .filter(l => l.exerciseId === te.exerciseId && !l.isWarmup)
      .toArray()

    if (logs.length === 0) continue

    const totalReps = logs.reduce((sum, l) => sum + l.reps, 0)
    const result = evaluatePerformance(totalReps, te.plannedSets, scheme)

    if (result === 'SAME') continue

    const nextTe = nextTemplateExercises.find(x => x.exerciseId === te.exerciseId)
    if (!nextTe) continue

    const currentWeight = te.plannedWeightKg ?? 0
    const delta = result === 'INCREASE' ? exercise.incrementKg : -exercise.incrementKg
    const nextWeight = Math.max(0, Math.round((currentWeight + delta) * 100) / 100)

    await db.templateExercises.update(nextTe.id!, { plannedWeightKg: nextWeight })
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
    await db.templateExercises.update(nextTe.id!, { plannedWeightKg: te.plannedWeightKg })
  }
}
