import { db } from '@/lib/db'
import { SEED_EXERCISES, SEED_PROGRAM, SEED_WEEKS } from '@/lib/seed-data'

// Initial cardio prescription that gets seeded into every workout. Picked
// with the user; matches the "30/7/5" start documented in the project
// memory. The cardio progresses week-over-week via computeNextCardio.
const CARDIO_SEED = {
  durationMin: 30,
  inclinePct: 7,
  speedKmh: 5,
}

export async function seedIfEmpty(): Promise<void> {
  const count = await db.programs.count()
  if (count > 0) return

  await db.transaction('rw', [
    db.programs, db.programWeeks, db.workoutTemplates,
    db.templateExercises, db.exercises,
  ], async () => {
    // Insert exercises
    const exerciseIds = new Map<string, number>()
    for (const ex of SEED_EXERCISES) {
      const { alternativeExerciseNames, requiresSetupNote, usesWarmup, barWeightKg, ...rest } = ex
      const id = await db.exercises.add({
        ...rest,
        restSeconds: ex.equipmentType === 'barbell' ? 90 : 60,
        alternativeExerciseIds: [], // resolved below after all exercises are inserted
        requiresSetupNote: requiresSetupNote ?? false,
        usesWarmup: usesWarmup ?? false,
        barWeightKg,
      })
      exerciseIds.set(ex.name, id)
    }

    // Resolve alternative names to IDs
    for (const ex of SEED_EXERCISES) {
      const id = exerciseIds.get(ex.name)!
      const altIds = ex.alternativeExerciseNames
        .map(name => exerciseIds.get(name))
        .filter((altId): altId is number => altId !== undefined)
      if (altIds.length > 0) {
        await db.exercises.update(id, { alternativeExerciseIds: altIds })
      }
    }

    // Cardio exercise lives outside the strength spreadsheet — seed it
    // programmatically so re-parsing the xlsx doesn't drop it.
    const inclineWalkId = await db.exercises.add({
      name: 'Incline Walk',
      category: 'cardio',
      primaryMuscle: 'general',
      equipmentType: 'cardio',
      weightDisplay: 'none',
      incrementKg: 0,
      restSeconds: 0,
      alternativeExerciseIds: [],
      isCustom: false,
      requiresSetupNote: false,
    })

    // Insert program
    const programId = await db.programs.add({
      name: SEED_PROGRAM.name,
      totalWeeks: SEED_PROGRAM.totalWeeks,
      startDate: null,
      isActive: 1,
    })

    // Insert weeks, templates, template exercises
    for (const week of SEED_WEEKS) {
      const weekId = await db.programWeeks.add({
        programId,
        weekNumber: week.weekNumber,
      })

      for (const workout of week.workouts) {
        const templateId = await db.workoutTemplates.add({
          programWeekId: weekId,
          label: workout.label,
          orderInWeek: ['A', 'B', 'C'].indexOf(workout.label),
        })

        for (const ex of workout.exercises) {
          const exerciseId = exerciseIds.get(ex.exerciseName)
          if (!exerciseId) continue

          await db.templateExercises.add({
            workoutTemplateId: templateId,
            exerciseId,
            orderInWorkout: ex.orderInWorkout,
            plannedSets: ex.plannedSets,
            plannedReps: ex.plannedReps,
            plannedWeightKg: ex.plannedWeightKg,
            warmupWeights: ex.warmupWeights,
          })
        }

        // Append the cardio bout last in every workout (all weeks
        // including deload — deload's cardio is left untouched by
        // progression, so it inherits the seed value initially and the
        // W12 → W13 carry-forward later).
        await db.templateExercises.add({
          workoutTemplateId: templateId,
          exerciseId: inclineWalkId,
          orderInWorkout: 100,
          plannedSets: 1,
          plannedReps: 'max',
          plannedWeightKg: null,
          warmupWeights: [],
          cardioDurationMin: CARDIO_SEED.durationMin,
          cardioInclinePct: CARDIO_SEED.inclinePct,
          cardioSpeedKmh: CARDIO_SEED.speedKmh,
        })
      }
    }
  })
}
