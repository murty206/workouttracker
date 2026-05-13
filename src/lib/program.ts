import { db } from '@/lib/db'
import { carryForwardWeights } from '@/lib/progression'
import type { WorkoutTemplate, Session } from '@/types'

export async function getCompletedSessions(): Promise<Session[]> {
  return db.sessions
    .filter(s => s.completedAt !== null)
    .sortBy('startedAt')
}

export async function getProgramProgress(): Promise<{
  weekNumber: number
  workoutLabel: 'A' | 'B' | 'C'
  completedCount: number
  totalSessions: number
  isComplete: boolean
}> {
  const program = await db.programs.where('isActive').equals(1).first()
  if (!program) return { weekNumber: 1, workoutLabel: 'A', completedCount: 0, totalSessions: 39, isComplete: false }

  const completed = await getCompletedSessions()
  const completedCount = completed.length
  // 12 weeks × 3 + 1 deload week (1 workout) = 37, or 13 weeks × 3 = 39
  const totalWeekSessions = program.totalWeeks * 3
  const deloadSessions = 3 // deload has up to 3 sessions too
  const totalSessions = totalWeekSessions + deloadSessions

  const weekNumber = Math.floor(completedCount / 3) + 1
  const labelIndex = completedCount % 3
  const workoutLabel = (['A', 'B', 'C'] as const)[labelIndex]
  const isComplete = weekNumber > program.totalWeeks + 1 // past deload week

  return { weekNumber, workoutLabel, completedCount, totalSessions, isComplete }
}

export async function getTodaysTemplate(): Promise<WorkoutTemplate | null> {
  const program = await db.programs.where('isActive').equals(1).first()
  if (!program) return null

  const { weekNumber, workoutLabel, isComplete } = await getProgramProgress()
  if (isComplete) return null

  const week = await db.programWeeks
    .where('[programId+weekNumber]')
    .equals([program.id!, weekNumber])
    .first()

  if (!week) return null

  const tmpl = await db.workoutTemplates
    .where('programWeekId').equals(week.id!)
    .filter(t => t.label === workoutLabel)
    .first()
  return tmpl ?? null
}

export async function getInProgressSession() {
  return db.sessions.filter(s => s.completedAt === null && !s.skipped).first()
}

export async function startSession(templateId: number, weekNumber: number, label: 'A' | 'B' | 'C'): Promise<number> {
  const program = await db.programs.where('isActive').equals(1).first()

  // Set program start date on first session
  if (program && !program.startDate) {
    await db.programs.update(program.id!, { startDate: new Date().toISOString() })
  }

  return db.sessions.add({
    workoutTemplateId: templateId,
    programId: program?.id ?? null,
    weekNumber,
    workoutLabel: label,
    startedAt: new Date().toISOString(),
    completedAt: null,
  })
}

export async function skipSession(templateId: number, weekNumber: number, label: 'A' | 'B' | 'C'): Promise<void> {
  const program = await db.programs.where('isActive').equals(1).first()
  await db.sessions.add({
    workoutTemplateId: templateId,
    programId: program?.id ?? null,
    weekNumber,
    workoutLabel: label,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    skipped: true,
  })
  if (program) {
    await carryForwardWeights(program.id!, weekNumber, templateId, label)
  }
}

export async function restartProgram(): Promise<void> {
  const oldProgram = await db.programs.where('isActive').equals(1).first()
  if (!oldProgram) return

  // Mark old program inactive
  await db.programs.update(oldProgram.id!, { isActive: 0 })

  // Get all template exercises for week 1 of old program and find last logged weight for each exercise
  const week1 = await db.programWeeks
    .where('[programId+weekNumber]').equals([oldProgram.id!, 1]).first()

  await db.transaction('rw', [
    db.programs, db.programWeeks, db.workoutTemplates, db.templateExercises,
  ], async () => {
    const newProgramId = await db.programs.add({
      name: oldProgram.name,
      totalWeeks: oldProgram.totalWeeks,
      startDate: null,
      isActive: 1,
    })

    // Copy all weeks/templates/exercises, using last logged weight for each exercise
    const oldWeeks = await db.programWeeks.where('programId').equals(oldProgram.id!).toArray()

    for (const oldWeek of oldWeeks) {
      const newWeekId = await db.programWeeks.add({
        programId: newProgramId,
        weekNumber: oldWeek.weekNumber,
      })

      const templates = await db.workoutTemplates
        .where('programWeekId').equals(oldWeek.id!).toArray()

      for (const tmpl of templates) {
        const newTemplateId = await db.workoutTemplates.add({
          programWeekId: newWeekId,
          label: tmpl.label,
          orderInWeek: tmpl.orderInWeek,
        })

        const exercises = await db.templateExercises
          .where('workoutTemplateId').equals(tmpl.id!).toArray()

        for (const te of exercises) {
          // Find last logged weight for this exercise
          const lastLog = await db.setLogs
            .where('exerciseId').equals(te.exerciseId)
            .filter(l => !l.isWarmup && l.weightKg !== null)
            .last()

          await db.templateExercises.add({
            workoutTemplateId: newTemplateId,
            exerciseId: te.exerciseId,
            orderInWorkout: te.orderInWorkout,
            plannedSets: te.plannedSets,
            plannedReps: te.plannedReps,
            plannedWeightKg: lastLog?.weightKg ?? te.plannedWeightKg,
            warmupWeights: te.warmupWeights,
          })
        }
      }
    }
  })
}
