import Dexie, { type Table } from 'dexie'
import type {
  Exercise, Program, ProgramWeek, WorkoutTemplate,
  TemplateExercise, Session, SetLog, PersonalRecord, BodyweightLog, UserPref,
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
      // (then-boolean) progression-state flags to false. v11 later
      // replaces readyForBump with bumpConfirmStreak.
      await tx.table('exercises').toCollection().modify((ex: Record<string, unknown>) => {
        if (ex.equipmentType === 'dumbbell') {
          ex.incrementKg = 2.5
        }
        if (ex.readyForBump === undefined) ex.readyForBump = false
        if (ex.justBumped === undefined) ex.justBumped = false
      })
    })

    this.version(6).stores({}).upgrade(async tx => {
      // Mark exercises whose performance depends on a physical setup the user
      // chooses each session (currently just Inverted Row — bar height).
      await tx.table('exercises').toCollection().modify((ex: Exercise) => {
        if (ex.requiresSetupNote === undefined) {
          ex.requiresSetupNote = ex.name === 'Inverted Row'
        }
      })
    })

    this.version(7).stores({}).upgrade(async tx => {
      // Dual PR system: pre-existing records are Epley-based "best ever",
      // semantically closest to the new Strength PR. Backfill as such.
      await tx.table('personalRecords').toCollection().modify((pr: PersonalRecord) => {
        if (pr.prType === undefined) pr.prType = 'strength'
      })
    })

    this.version(8).stores({}).upgrade(async tx => {
      // Bodyweight exercises have no weight to progress and use a "max" rep
      // scheme by convention. Any templateExercise pointing at a bodyweight
      // exercise that ended up with a numeric rep scheme (e.g. swapped from
      // a weighted lift) gets reset to the bodyweight defaults.
      const bwExercises = await tx.table('exercises')
        .filter((ex: Exercise) => ex.equipmentType === 'bodyweight')
        .toArray()
      const bwIds = new Set(bwExercises.map((ex: Exercise) => ex.id))
      await tx.table('templateExercises').toCollection().modify((te: TemplateExercise) => {
        if (bwIds.has(te.exerciseId)) {
          te.plannedReps = 'max'
          te.plannedWeightKg = null
          te.warmupWeights = []
        }
      })
    })

    this.version(9).stores({}).upgrade(async tx => {
      // Overhead Triceps Extension is a machine in the user's gym, not a
      // dumbbell lift. Recategorise; historical weights were already
      // entered as machine totals so the numbers stay. Floor
      // plannedWeightKg to the nearest 5 kg and drop precomputed warmups
      // (next applyProgression repopulates them with the machine 5-kg
      // step).
      await tx.table('exercises').toCollection().modify((ex: Exercise) => {
        if (ex.name === 'Overhead Triceps Extension') {
          ex.category = 'machine'
          ex.equipmentType = 'machine'
          ex.weightDisplay = 'total'
          ex.incrementKg = 5
        }
      })

      const ohtRow = await tx.table('exercises')
        .filter((ex: Exercise) => ex.name === 'Overhead Triceps Extension')
        .first()
      if (ohtRow?.id) {
        const ohtId = ohtRow.id
        await tx.table('templateExercises').toCollection().modify((te: TemplateExercise) => {
          if (te.exerciseId === ohtId) {
            if (te.plannedWeightKg !== null) {
              te.plannedWeightKg = Math.floor(te.plannedWeightKg / 5) * 5
            }
            te.warmupWeights = []
          }
        })
      }
    })

    this.version(10).stores({}).upgrade(async tx => {
      // Cardio: add the "Incline Walk" exercise + a per-workout cardio
      // TemplateExercise pinned to every existing A/B/C template. Skips
      // anything that already exists so re-running is safe.
      const inclineWalkExisting = await tx.table('exercises')
        .filter((ex: Exercise) => ex.name === 'Incline Walk')
        .first()
      let inclineWalkId: number | undefined = inclineWalkExisting?.id
      if (!inclineWalkId) {
        inclineWalkId = await tx.table('exercises').add({
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
        } as Exercise)
      }

      const allTemplates = await tx.table('workoutTemplates').toArray()
      for (const tmpl of allTemplates) {
        const existing = await tx.table('templateExercises')
          .where('workoutTemplateId').equals(tmpl.id)
          .filter((te: TemplateExercise) => te.exerciseId === inclineWalkId)
          .first()
        if (existing) continue
        await tx.table('templateExercises').add({
          workoutTemplateId: tmpl.id,
          exerciseId: inclineWalkId!,
          orderInWorkout: 100,
          plannedSets: 1,
          plannedReps: 'max',
          plannedWeightKg: null,
          warmupWeights: [],
          cardioDurationMin: 30,
          cardioInclinePct: 7,
          cardioSpeedKmh: 5,
        } as TemplateExercise)
      }
    })

    this.version(11).stores({}).upgrade(async tx => {
      // B+ rule: replace the boolean readyForBump with a numeric streak
      // counter (bumpConfirmStreak). Existing readyForBump=true means
      // the user had one prior confirmation, so seed the streak at 1.
      // readyForBump=false or missing → 0.
      await tx.table('exercises').toCollection().modify((ex: Record<string, unknown>) => {
        ex.bumpConfirmStreak = ex.readyForBump === true ? 1 : 0
        delete ex.readyForBump
      })
    })

    this.version(12).stores({}).upgrade(async tx => {
      // A17: barbell warmup tiers now read off the total bar load, not the
      // per-side number, so a 17.5 kg/side OHP gets 2 warmups instead of 1.
      // Recompute warmups for every existing barbell template; non-barbell
      // tiers are unchanged so we leave those alone.
      const barbellIds = new Set<number>()
      await tx.table('exercises')
        .filter((ex: Exercise) => ex.equipmentType === 'barbell')
        .each((ex: Exercise) => { if (ex.id !== undefined) barbellIds.add(ex.id) })

      await tx.table('templateExercises').toCollection().modify((te: TemplateExercise) => {
        if (!barbellIds.has(te.exerciseId)) return
        if (te.plannedWeightKg === null) return
        const workingKg = te.plannedWeightKg
        const totalKg = workingKg * 2 + 20
        if (totalKg < 30) { te.warmupWeights = []; return }
        const fractions = totalKg >= 60 ? [0.4, 0.6, 0.8] : [0.5, 0.75]
        te.warmupWeights = fractions.map(f => Math.floor((workingKg * f) / 2.5) * 2.5)
      })
    })

    this.version(13).stores({}).upgrade(async tx => {
      // The spreadsheet only specifies warmups for the main compound lifts;
      // applyProgression was auto-generating warmups for every non-bodyweight
      // exercise instead, so accessories drifted away from the program intent
      // starting Week 2. Add a per-exercise usesWarmup flag and clear the
      // warmupWeights on existing accessory templates.
      const WARMUP_LIFTS = new Set([
        'Bench Press',
        'Squat',
        'Back Squat',
        'Over Head Press',
        'Barbell Row',
        'DB Shoulder Press',
        'Dumbbell Romanian Deadlift',
      ])
      const noWarmupIds = new Set<number>()
      await tx.table('exercises').toCollection().modify((ex: Exercise) => {
        const usesWarmup = WARMUP_LIFTS.has(ex.name)
        ex.usesWarmup = usesWarmup
        if (!usesWarmup && ex.id !== undefined) noWarmupIds.add(ex.id)
      })
      await tx.table('templateExercises').toCollection().modify((te: TemplateExercise) => {
        if (noWarmupIds.has(te.exerciseId) && te.warmupWeights && te.warmupWeights.length > 0) {
          te.warmupWeights = []
        }
      })
    })
  }
}

export const db = new WorkoutDB()
db.open().catch(err => console.error('DB failed to open:', err))
