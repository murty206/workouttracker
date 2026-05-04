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
  }
}

export const db = new WorkoutDB()
db.open().catch(err => console.error('DB failed to open:', err))
