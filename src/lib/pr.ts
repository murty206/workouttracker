import { db } from '@/lib/db'
import type { PersonalRecord, PRType, SetLog } from '@/types'

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

// ─── Pure PR decision ─────────────────────────────────────────────────────────

export interface PRCheckInput {
  weightKg: number
  reps: number
  priorMaxWeight: number
  priorMaxRepsAtMaxWeight: number
}

export interface PRCheckResult {
  strength: boolean
  reps: boolean
}

// Strength PR: this set's weight beats the prior heaviest weight ever.
// Rep PR: this set is at the (possibly new) max weight AND beats the prior
//         best reps at that weight. When a Strength PR fires at a never-
//         before-attempted weight, the Rep PR fires too (first set at the
//         new max is by definition the most reps at it).
export function checkPR(input: PRCheckInput): PRCheckResult {
  const { weightKg, reps, priorMaxWeight, priorMaxRepsAtMaxWeight } = input

  const isStrength = weightKg > priorMaxWeight

  let isReps = false
  if (isStrength) {
    isReps = true // first time at this new max weight
  } else if (weightKg === priorMaxWeight && reps > priorMaxRepsAtMaxWeight) {
    isReps = true
  }

  return { strength: isStrength, reps: isReps }
}

// Bodyweight Rep PR: there is no weight to compare, only single-set rep count.
// Fires when this set has more reps than any prior bodyweight set for the same
// exercise. There is no Strength PR analogue — the "weight" is constant.
export function checkBodyweightRepPR(reps: number, priorMaxReps: number): boolean {
  return reps > priorMaxReps
}

// ─── DB-facing PR detection ───────────────────────────────────────────────────

async function getPriorMaxes(exerciseId: number): Promise<{
  maxWeight: number
  maxRepsAtMaxWeight: number
}> {
  const logs = await db.setLogs
    .where('exerciseId').equals(exerciseId)
    .filter(l => !l.isWarmup && l.weightKg !== null && l.weightKg > 0)
    .toArray()

  if (logs.length === 0) return { maxWeight: 0, maxRepsAtMaxWeight: 0 }

  const maxWeight = logs.reduce((m, l) => Math.max(m, l.weightKg!), 0)
  const maxRepsAtMaxWeight = logs
    .filter(l => l.weightKg === maxWeight)
    .reduce((m, l) => Math.max(m, l.reps), 0)

  return { maxWeight, maxRepsAtMaxWeight }
}

async function upsertSessionPR(
  exerciseId: number,
  weightKg: number | null,
  reps: number,
  sessionId: number,
  setLogId: number,
  prType: PRType,
): Promise<void> {
  const existing = await db.personalRecords
    .where('exerciseId').equals(exerciseId)
    .filter(pr => pr.sessionId === sessionId && pr.prType === prType)
    .first()

  const payload: Omit<PersonalRecord, 'id'> = {
    exerciseId,
    weightKg,
    reps,
    // Epley is meaningless without a weight; bodyweight rows store 0.
    estimatedOneRepMax: weightKg === null ? 0 : epley(weightKg, reps),
    achievedAt: new Date().toISOString(),
    sessionId,
    setLogId,
    prType,
  }

  if (existing) {
    await db.personalRecords.update(existing.id!, payload)
    if (existing.setLogId !== setLogId) {
      // clear isPR on the prior best-of-session set if no other PR type
      // still anchors it
      const stillAnchors = await db.personalRecords
        .where('exerciseId').equals(exerciseId)
        .filter(pr => pr.setLogId === existing.setLogId && pr.id !== existing.id)
        .first()
      if (!stillAnchors) {
        await db.setLogs.update(existing.setLogId, { isPR: false })
      }
    }
  } else {
    await db.personalRecords.add(payload)
  }
}

export async function detectAndSavePR(
  exerciseId: number,
  weightKg: number | null,
  reps: number,
  sessionId: number,
  setLogId: number,
): Promise<boolean> {
  // Bodyweight branch: no weight to compare, only a Rep PR for "most reps in
  // a single set ever". priorMax considers any prior bodyweight working set
  // for this exercise.
  if (weightKg === null) {
    const allLogs = await db.setLogs
      .where('exerciseId').equals(exerciseId)
      .filter(l => !l.isWarmup && l.weightKg === null && l.id !== setLogId)
      .toArray()
    const priorMaxReps = allLogs.reduce((m, l) => Math.max(m, l.reps), 0)
    if (!checkBodyweightRepPR(reps, priorMaxReps)) return false
    await upsertSessionPR(exerciseId, null, reps, sessionId, setLogId, 'reps')
    return true
  }

  if (weightKg === 0) return false

  // Compare against the set's own session-history too — but exclude the
  // current set (it's just been logged) by filtering out setLogId.
  const allLogs = await db.setLogs
    .where('exerciseId').equals(exerciseId)
    .filter(l => !l.isWarmup && l.weightKg !== null && l.weightKg > 0 && l.id !== setLogId)
    .toArray()

  const priorMaxWeight = allLogs.reduce((m, l) => Math.max(m, l.weightKg!), 0)
  const priorMaxRepsAtMaxWeight = allLogs
    .filter(l => l.weightKg === priorMaxWeight)
    .reduce((m, l) => Math.max(m, l.reps), 0)

  const result = checkPR({
    weightKg,
    reps,
    priorMaxWeight,
    priorMaxRepsAtMaxWeight,
  })

  if (!result.strength && !result.reps) return false

  if (result.strength) {
    await upsertSessionPR(exerciseId, weightKg, reps, sessionId, setLogId, 'strength')
  }
  if (result.reps) {
    await upsertSessionPR(exerciseId, weightKg, reps, sessionId, setLogId, 'reps')
  }

  return true
}

// Rebuild personalRecords + setLogs.isPR for one exercise by replaying all
// working sets in chronological order. Weighted sets evaluate against the
// running max-weight / max-reps-at-max-weight; both Strength and Rep PRs
// can fire. Bodyweight sets evaluate against a single running max-reps
// counter and only Rep PRs fire. Intra-session dedup: one record per
// (sessionId, prType).
export async function rebuildPRsForExercise(exerciseId: number): Promise<void> {
  const existing = await db.personalRecords
    .where('exerciseId').equals(exerciseId)
    .toArray()
  await Promise.all(existing.map(pr => db.personalRecords.delete(pr.id!)))

  const logs = await db.setLogs
    .where('exerciseId').equals(exerciseId)
    .filter(l => !l.isWarmup && (l.weightKg === null || l.weightKg > 0))
    .sortBy('loggedAt')

  let maxWeight = 0
  let maxRepsAtMaxWeight = 0
  let bodyweightMaxReps = 0
  const sessionRecords = new Map<
    string,
    { setLogId: number; weightKg: number | null; reps: number; achievedAt: string }
  >()

  // First pass: scan logs, decide each set's PR contributions.
  for (const log of logs) {
    if (log.weightKg === null) {
      if (checkBodyweightRepPR(log.reps, bodyweightMaxReps)) {
        sessionRecords.set(`${log.sessionId}:reps`, {
          setLogId: log.id!,
          weightKg: null,
          reps: log.reps,
          achievedAt: log.loggedAt,
        })
      }
      if (log.reps > bodyweightMaxReps) bodyweightMaxReps = log.reps
      continue
    }

    const result = checkPR({
      weightKg: log.weightKg,
      reps: log.reps,
      priorMaxWeight: maxWeight,
      priorMaxRepsAtMaxWeight: maxRepsAtMaxWeight,
    })

    if (result.strength) {
      sessionRecords.set(`${log.sessionId}:strength`, {
        setLogId: log.id!,
        weightKg: log.weightKg,
        reps: log.reps,
        achievedAt: log.loggedAt,
      })
    }
    if (result.reps) {
      sessionRecords.set(`${log.sessionId}:reps`, {
        setLogId: log.id!,
        weightKg: log.weightKg,
        reps: log.reps,
        achievedAt: log.loggedAt,
      })
    }

    if (log.weightKg > maxWeight) {
      maxWeight = log.weightKg
      maxRepsAtMaxWeight = log.reps
    } else if (log.weightKg === maxWeight && log.reps > maxRepsAtMaxWeight) {
      maxRepsAtMaxWeight = log.reps
    }
  }

  // Second pass: clear all setLogs.isPR for this exercise, then set only
  // those that anchor at least one PR record.
  await db.setLogs
    .where('exerciseId').equals(exerciseId)
    .modify({ isPR: false })

  const anchoredSetLogIds = new Set<number>()
  for (const [key, rec] of sessionRecords.entries()) {
    const [sessionIdStr, prType] = key.split(':')
    const sessionId = Number(sessionIdStr)
    await db.personalRecords.add({
      exerciseId,
      weightKg: rec.weightKg,
      reps: rec.reps,
      // Epley is meaningless for bodyweight; store 0 as a sentinel.
      estimatedOneRepMax: rec.weightKg === null ? 0 : epley(rec.weightKg, rec.reps),
      achievedAt: rec.achievedAt,
      sessionId,
      setLogId: rec.setLogId,
      prType: prType as PRType,
    })
    anchoredSetLogIds.add(rec.setLogId)
  }
  for (const setLogId of anchoredSetLogIds) {
    await db.setLogs.update(setLogId, { isPR: true })
  }
}

// Helper exposed for tests + UI to know what kind of PR badge to render
// when a SetLog has isPR=true.
export async function prTypesForSetLog(setLog: SetLog): Promise<PRType[]> {
  if (!setLog.isPR || setLog.id === undefined) return []
  const records = await db.personalRecords
    .where('exerciseId').equals(setLog.exerciseId)
    .filter(pr => pr.setLogId === setLog.id)
    .toArray()
  return records.map(r => r.prType)
}
