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

// % jump above which dumbbell exercises require multi-session confirmation
// before bumping. 15 % is the line that flags 5 → 7.5 (+50 %) as risky
// but lets 25 → 27.5 (+10 %) bump normally.
const DUMBBELL_DOUBLE_CONFIRM_PCT = 0.15

// Number of consecutive INCREASE sessions a small-step dumbbell needs
// before the algorithm bumps. Bumped to 3 (from 2) after backup-data
// analysis showed user-initiated drops should be honoured more
// generously — three crush sessions in a row is a clearer signal of
// readiness than two.
const DUMBBELL_BUMP_CONFIRM_COUNT = 3

// Deload week target weight as a fraction of the prior week's lifted median.
// 0.5 matches Texas Method / 5/3/1 conventions: light enough for recovery,
// heavy enough to keep the movement pattern grooved.
const DELOAD_FACTOR = 0.5

export function computeDeloadWeight(
  basisKg: number,
  equipmentType: EquipmentType,
): number {
  if (basisKg <= 0) return 0
  const step = equipmentType === 'machine' ? 5 : 2.5
  return Math.max(0, Math.floor((basisKg * DELOAD_FACTOR) / step) * step)
}

// ─── Equipment snapping ───────────────────────────────────────────────────────

// Map an arbitrary kg target onto a weight the user can actually load on the
// equipment. The user's gym uses 2.5 kg increments for both barbell plates
// and dumbbells, and 5 kg increments on machine stacks. Bodyweight + cardio
// have no weight to snap.
//
// `direction` controls rounding when the target lands between steps:
//   - 'up'   → ceil to the next available step (for INCREASE / INCREASE_2)
//   - 'down' → floor to the prior step (for DECREASE / deload)
//   - 'nearest' → round half-up; used as a safety net for SAME, where the
//     basis should already be a valid step but float drift may have nudged it
//
// Without this, `decideProgression`'s `basis ± increment` can produce
// half-step values (e.g. 11.25 from old-code data) that the user cannot
// physically load.
export function snapToAvailable(
  targetKg: number,
  equipmentType: EquipmentType,
  direction: 'up' | 'down' | 'nearest' = 'nearest',
): number {
  if (equipmentType === 'bodyweight' || equipmentType === 'cardio') return targetKg
  if (targetKg <= 0) return 0
  const step = equipmentType === 'machine' ? 5 : 2.5
  const n = targetKg / step
  let snapped: number
  if (direction === 'up') snapped = Math.ceil(n) * step
  else if (direction === 'down') snapped = Math.floor(n) * step
  else snapped = Math.round(n) * step
  return Math.max(0, Math.round(snapped * 100) / 100)
}

// ─── Cardio progression ───────────────────────────────────────────────────────

export const CARDIO_INCLINE_CAP_PCT = 12
export const CARDIO_SPEED_CAP_KMH = 5.5
export const CARDIO_INCLINE_STEP_PCT = 0.5
export const CARDIO_SPEED_STEP_KMH = 0.25

export interface CardioPrescription {
  durationMin: number
  inclinePct: number
  speedKmh: number
}

// Round to two decimals to absorb 0.1+0.2-style float drift; speed steps
// of 0.25 need two-decimal precision, incline steps of 0.5 fit too.
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// Apply one rotation step from `current` for week `nextWeekN`.
// Even weeks (W2, W4, …) are "incline weeks" — bump incline first; if at
// the cap, fall through to speed. Odd weeks (W3, W5, …) are "speed weeks"
// — symmetric. Duration is left untouched (user-set fixed cap of 30 min).
//
// `anyTicks`: was at least one cardio bout completed last week? If false,
// the prescription stays put. `isDeload`: next week is the deload — stays
// put too (deload doesn't apply to cardio per the user's spec).
export function computeNextCardio(
  current: CardioPrescription,
  nextWeekN: number,
  anyTicks: boolean,
  isDeload: boolean,
): CardioPrescription {
  if (!anyTicks || isDeload) return { ...current }

  const isInclineWeek = nextWeekN % 2 === 0
  const inclineNew = r2(Math.min(current.inclinePct + CARDIO_INCLINE_STEP_PCT, CARDIO_INCLINE_CAP_PCT))
  const speedNew = r2(Math.min(current.speedKmh + CARDIO_SPEED_STEP_KMH, CARDIO_SPEED_CAP_KMH))

  if (isInclineWeek) {
    if (inclineNew > current.inclinePct) {
      return { ...current, inclinePct: inclineNew }
    }
    // Incline at cap → fall through to speed
    return { ...current, speedKmh: speedNew }
  } else {
    if (speedNew > current.speedKmh) {
      return { ...current, speedKmh: speedNew }
    }
    // Speed at cap → fall through to incline
    return { ...current, inclinePct: inclineNew }
  }
}

export interface ProgressionDecision {
  nextWeightKg: number
  bumpConfirmStreak: number
  justBumped: boolean
  // For diagnostics / future UI hints. Not currently surfaced.
  reason: 'no-change' | 'increase' | 'increase-2' | 'decrease' | 'bump-confirmed' | 'awaiting-confirmation' | 'grace'
}

export interface ProgressionInput {
  basisKg: number
  result: ProgressionResult
  incrementKg: number
  equipmentType: EquipmentType
  bumpConfirmStreak: number
  justBumped: boolean
}

export function decideProgression(input: ProgressionInput): ProgressionDecision {
  const { basisKg, result, incrementKg, equipmentType, bumpConfirmStreak, justBumped } = input
  const round = (w: number) => Math.max(0, Math.round(w * 100) / 100)

  // DECREASE with a fresh bump → soak one session at the higher weight.
  if (result === 'DECREASE' && justBumped) {
    return {
      nextWeightKg: round(basisKg),
      bumpConfirmStreak: 0,
      justBumped: false,
      reason: 'grace',
    }
  }

  if (result === 'DECREASE') {
    return {
      nextWeightKg: round(basisKg - incrementKg),
      bumpConfirmStreak: 0,
      justBumped: false,
      reason: 'decrease',
    }
  }

  if (result === 'SAME') {
    // Hitting the middle of the range does not count as a bump confirmation —
    // any pending streak is cleared.
    return {
      nextWeightKg: round(basisKg),
      bumpConfirmStreak: 0,
      justBumped: false,
      reason: 'no-change',
    }
  }

  // INCREASE or INCREASE_2.
  // For dumbbells the rack steps in fixed 2.5 kg increments — a "double
  // increment" is always a 5 kg / 100 % jump from a small DB, which is
  // unsupportable. Cap dumbbell to a single step regardless of how hard
  // the user crushed the session; the rep performance was just a signal
  // they're ready for the next dumbbell, not two ahead.
  const rawSteps = result === 'INCREASE_2' ? 2 : 1
  const steps = equipmentType === 'dumbbell' ? 1 : rawSteps
  const delta = incrementKg * steps
  const pctJump = basisKg > 0 ? delta / basisKg : Infinity

  const needsMultiConfirm =
    equipmentType === 'dumbbell' && pctJump > DUMBBELL_DOUBLE_CONFIRM_PCT

  if (needsMultiConfirm) {
    const newStreak = bumpConfirmStreak + 1
    if (newStreak < DUMBBELL_BUMP_CONFIRM_COUNT) {
      return {
        nextWeightKg: round(basisKg),
        bumpConfirmStreak: newStreak,
        justBumped: false,
        reason: 'awaiting-confirmation',
      }
    }
  }

  return {
    nextWeightKg: round(basisKg + delta),
    bumpConfirmStreak: 0,
    justBumped: needsMultiConfirm, // grace only when the jump was risky
    reason: needsMultiConfirm
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

  const program = await db.programs.get(session.programId)
  if (!program) return

  const nextWeek = await db.programWeeks
    .where('[programId+weekNumber]')
    .equals([session.programId, session.weekNumber + 1])
    .first()
  if (!nextWeek) return

  const isNextDeload = nextWeek.weekNumber > program.totalWeeks

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
    if (!exercise) continue
    if (exercise.equipmentType === 'bodyweight') continue
    if (exercise.equipmentType === 'cardio') continue // handled separately below

    const scheme = parseRepScheme(te.plannedReps)
    if (!scheme) continue

    const logs = await db.setLogs
      .where('sessionId').equals(sessionId)
      .filter(l => l.exerciseId === te.exerciseId && !l.isWarmup && l.weightKg !== null)
      .toArray()

    if (logs.length === 0) continue

    const basis = median(logs.map(l => l.weightKg!))
    const nextTe = nextTemplateExercises.find(x => x.exerciseId === te.exerciseId)
    if (!nextTe) continue

    // Deload week: scale the lifted median by DELOAD_FACTOR, no warmups,
    // and don't touch progression-state flags (they apply to training weeks).
    if (isNextDeload) {
      await db.templateExercises.update(nextTe.id!, {
        plannedWeightKg: computeDeloadWeight(basis, exercise.equipmentType),
        warmupWeights: [],
      })
      continue
    }

    const setReps = logs.map(l => l.reps)
    const result = evaluatePerformance(setReps, scheme)

    const decision = decideProgression({
      basisKg: basis,
      result,
      incrementKg: exercise.incrementKg,
      equipmentType: exercise.equipmentType,
      bumpConfirmStreak: exercise.bumpConfirmStreak ?? 0,
      justBumped: exercise.justBumped ?? false,
    })

    // Persist flag transitions on the exercise so they carry across weeks.
    if (
      (exercise.bumpConfirmStreak ?? 0) !== decision.bumpConfirmStreak ||
      (exercise.justBumped ?? false) !== decision.justBumped
    ) {
      await db.exercises.update(exercise.id!, {
        bumpConfirmStreak: decision.bumpConfirmStreak,
        justBumped: decision.justBumped,
      })
    }

    // Snap the decided weight onto a physically loadable step. Direction is
    // chosen so an INCREASE never silently drops to the basis and a DECREASE
    // never silently bumps; holds round to the nearest step to repair any
    // half-step value that may have leaked in from older code.
    const snapDirection: 'up' | 'down' | 'nearest' =
      decision.reason === 'increase' ||
      decision.reason === 'increase-2' ||
      decision.reason === 'bump-confirmed'
        ? 'up'
        : decision.reason === 'decrease'
        ? 'down'
        : 'nearest'
    const snappedWeight = snapToAvailable(
      decision.nextWeightKg,
      exercise.equipmentType,
      snapDirection,
    )

    const nextWarmups = computeWarmupWeights(snappedWeight, exercise.equipmentType)
    await db.templateExercises.update(nextTe.id!, {
      plannedWeightKg: snappedWeight,
      warmupWeights: nextWarmups,
    })
  }

  // Cardio progression — runs once per session, idempotent across the
  // week. Bumps next-week's cardio prescription if ≥1 cardio bout was
  // ticked in any completed session of this week. Deload week (W13)
  // inherits W12's prescription unchanged.
  const cardioExercises = await db.exercises
    .filter(ex => ex.equipmentType === 'cardio')
    .toArray()
  const cardioExId = cardioExercises[0]?.id
  if (cardioExId) {
    const currentCardioTe = templateExercises.find(te => te.exerciseId === cardioExId)
    if (currentCardioTe) {
      const current: CardioPrescription = {
        durationMin: currentCardioTe.cardioDurationMin ?? 30,
        inclinePct: currentCardioTe.cardioInclinePct ?? 7,
        speedKmh: currentCardioTe.cardioSpeedKmh ?? 5,
      }

      const currentWeek = await db.programWeeks
        .where('[programId+weekNumber]')
        .equals([session.programId, session.weekNumber])
        .first()
      if (currentWeek) {
        const weekTemplates = await db.workoutTemplates
          .where('programWeekId').equals(currentWeek.id!)
          .toArray()
        const weekTemplateIds = weekTemplates.map(t => t.id!)
        const weekSessions = await db.sessions
          .where('workoutTemplateId').anyOf(weekTemplateIds)
          .filter(s => !!s.completedAt && !s.skipped)
          .toArray()

        let anyTicks = false
        for (const s of weekSessions) {
          const tick = await db.setLogs
            .where('sessionId').equals(s.id!)
            .filter(l => l.exerciseId === cardioExId && !l.isWarmup)
            .first()
          if (tick) { anyTicks = true; break }
        }

        const next = computeNextCardio(current, nextWeek.weekNumber, anyTicks, isNextDeload)

        const nextWeekTemplates = await db.workoutTemplates
          .where('programWeekId').equals(nextWeek.id!)
          .toArray()
        for (const nextTmpl of nextWeekTemplates) {
          const nextCardioTe = await db.templateExercises
            .where('workoutTemplateId').equals(nextTmpl.id!)
            .filter(te => te.exerciseId === cardioExId)
            .first()
          if (nextCardioTe) {
            await db.templateExercises.update(nextCardioTe.id!, {
              cardioDurationMin: next.durationMin,
              cardioInclinePct: next.inclinePct,
              cardioSpeedKmh: next.speedKmh,
            })
          }
        }
      }
    }
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
  const program = await db.programs.get(programId)
  if (!program) return

  const nextWeek = await db.programWeeks
    .where('[programId+weekNumber]')
    .equals([programId, weekNumber + 1])
    .first()
  if (!nextWeek) return

  // Skipping a workout in the last training week should not propagate weights
  // into the deload week — that template is intentionally lighter.
  if (nextWeek.weekNumber > program.totalWeeks) return

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
    const nextTe = nextTemplateExercises.find(x => x.exerciseId === te.exerciseId)
    if (!nextTe) continue
    const exercise = await db.exercises.get(te.exerciseId)
    if (!exercise) continue

    // Cardio rows: copy the prescription so a fully-skipped week doesn't
    // reset cardio to the original seed. Strength fields stay null on
    // cardio rows, so the rest of this branch is skipped.
    if (exercise.equipmentType === 'cardio') {
      await db.templateExercises.update(nextTe.id!, {
        cardioDurationMin: te.cardioDurationMin,
        cardioInclinePct: te.cardioInclinePct,
        cardioSpeedKmh: te.cardioSpeedKmh,
      })
      continue
    }

    if (te.plannedWeightKg === null) continue
    const warmups = computeWarmupWeights(te.plannedWeightKg, exercise.equipmentType)
    await db.templateExercises.update(nextTe.id!, {
      plannedWeightKg: te.plannedWeightKg,
      warmupWeights: warmups,
    })
  }
}
