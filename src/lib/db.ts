import Dexie, { type Table } from 'dexie'
import type {
  Exercise, Program, ProgramWeek, WorkoutTemplate,
  TemplateExercise, Session, SetLog, PersonalRecord, BodyweightLog, UserPref
} from '@/types'

export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise>
  programs!: Table<Program>
  programWeeks!: Table<ProgramWeek>
  workoutTemplates!: Table<WorkoutTemplate>
  templateExercises!: Table<TemplateExercise>
  sessions!: Table<Session>
  setLogs!: Table<SetLog>
  personalRecords!: Table<PersonalRecord>
  bodyweightLogs!: Table<BodyweightLog>
  userPrefs!: Table<UserPref>

  constructor() {
    super('WorkoutTrackerDB')
    this.version(1).stores({
      exercises:         '++id, name, equipmentType',
      programs:          '++id, isActive',
      programWeeks:      '++id, programId, weekNumber, [programId+weekNumber]',
      workoutTemplates:  '++id, programWeekId, label',
      templateExercises: '++id, workoutTemplateId, exerciseId',
      sessions:          '++id, workoutTemplateId, startedAt, completedAt, weekNumber',
      setLogs:           '++id, sessionId, exerciseId, loggedAt, isPR',
      personalRecords:   '++id, exerciseId, achievedAt',
      bodyweightLogs:    '++id, loggedAt',
    })
    this.version(2).stores({
      userPrefs: '&key',
    }).upgrade(async tx => {
      await tx.table('exercises').toCollection().modify((ex: Exercise) => {
        if (ex.restSeconds === undefined) {
          ex.restSeconds = ex.equipmentType === 'barbell' ? 90 : 60
        }
        if (ex.alternativeExerciseIds === undefined) {
          ex.alternativeExerciseIds = []
        }
      })
    })

    this.version(3).stores({}).upgrade(async tx => {
      await tx.table('exercises').toCollection().modify((ex: Exercise) => {
        if (ex.equipmentType === 'machine') {
          ex.incrementKg = 5
        }
      })
    })

    this.version(4).stores({}).upgrade(async tx => {
      // Round machine exercise planned weights to nearest 5 kg (floor)
      const machineExercises = await tx.table('exercises')
        .filter((ex: Exercise) => ex.equipmentType === 'machine')
        .toArray()
      const machineIds = new Set(machineExercises.map((ex: Exercise) => ex.id))
      await tx.table('templateExercises').toCollection().modify((te: TemplateExercise) => {
        if (machineIds.has(te.exerciseId) && te.plannedWeightKg !== null) {
          te.plannedWeightKg = Math.floor(te.plannedWeightKg / 5) * 5
        }
      })
    })

    this.version(5).stores({}).upgrade(async tx => {
      // Dumbbell rack increments are physically 2.5 kg per dumbbell (no
      // 1.25 kg microplates). Fix the per-exercise incrementKg and init the
      // new progression-state flags to false.
      await tx.table('exercises').toCollection().modify((ex: Exercise) => {
        if (ex.equipmentType === 'dumbbell') {
          ex.incrementKg = 2.5
        }
        if (ex.readyForBump === undefined) ex.readyForBump = false
        if (ex.justBumped === undefined) ex.justBumped = false
      })
    })
  }
}

export const db = new WorkoutDB()
db.open().catch(err => console.error('DB failed to open:', err))
