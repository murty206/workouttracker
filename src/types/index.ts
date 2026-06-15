export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'cardio'
export type WeightDisplay = 'per-side' | 'total' | 'none'
export type WorkoutLabel = 'A' | 'B' | 'C'
export type ProgressionResult = 'INCREASE' | 'INCREASE_2' | 'SAME' | 'DECREASE'

export interface Exercise {
  id?: number
  name: string
  category: string
  primaryMuscle: string
  equipmentType: EquipmentType
  weightDisplay: WeightDisplay
  incrementKg: number
  restSeconds: number
  alternativeExerciseIds: number[]
  isCustom: boolean
  notes?: string
  // Internal progression state — managed by applyProgression, not the UI.
  // bumpConfirmStreak: consecutive sessions where evaluatePerformance said
  // INCREASE on a dumbbell whose next step is a >15 % jump. Algorithm
  // holds the bump until the streak reaches DUMBBELL_BUMP_CONFIRM_COUNT
  // (currently 3). Any SAME or DECREASE resets to 0.
  // justBumped: last applyProgression actually bumped this exercise; grants
  // a one-session DECREASE grace so the user doesn't oscillate around a
  // big jump.
  bumpConfirmStreak?: number
  justBumped?: boolean
  // True for exercises whose performance depends on a physical setup the user
  // chooses each session (e.g. inverted row bar height). Surfaces a small
  // "setup note" input above the working sets; the string is saved on each
  // SetLog for that session.
  requiresSetupNote?: boolean
  // Whether this exercise gets auto-generated warmup sets. The spreadsheet
  // only specifies warmups for the main compound lifts (Bench, Squat, OHP,
  // Row, DB Shoulder Press, Dumbbell Romanian Deadlift); accessories run
  // straight into the working sets. Undefined treated as false.
  usesWarmup?: boolean
}

export interface UserPref {
  key: string
  value: string
}

export interface Program {
  id?: number
  name: string
  totalWeeks: number
  startDate: string | null
  isActive: 0 | 1
}

export interface ProgramWeek {
  id?: number
  programId: number
  weekNumber: number
}

export interface WorkoutTemplate {
  id?: number
  programWeekId: number
  label: WorkoutLabel
  orderInWeek: number
}

export interface TemplateExercise {
  id?: number
  workoutTemplateId: number
  exerciseId: number
  orderInWorkout: number
  plannedSets: number
  plannedReps: string
  plannedWeightKg: number | null
  warmupWeights: number[]
  note?: string
  // Cardio-only prescription. Set when the linked exercise has
  // equipmentType='cardio'; ignored otherwise. The lifting fields above
  // (plannedSets/Reps/WeightKg/warmupWeights) are kept as their defaults
  // (1, 'max', null, []) for cardio rows.
  cardioDurationMin?: number
  cardioInclinePct?: number
  cardioSpeedKmh?: number
}

export interface Session {
  id?: number
  workoutTemplateId: number | null
  programId: number | null
  weekNumber: number | null
  workoutLabel: WorkoutLabel
  startedAt: string
  completedAt: string | null
  skipped?: boolean
  notes?: string
  // Optional smartwatch metrics entered post-workout. null/undefined = not recorded.
  caloriesKcal?: number | null
  avgHr?: number | null
  maxHr?: number | null
}

export interface SetLog {
  id?: number
  sessionId: number
  exerciseId: number
  setNumber: number
  weightKg: number | null
  reps: number
  isWarmup: boolean
  isPR: boolean
  loggedAt: string
  setupNote?: string
}

export type PRType = 'strength' | 'reps'

export interface PersonalRecord {
  id?: number
  exerciseId: number
  weightKg: number | null
  reps: number
  estimatedOneRepMax: number
  achievedAt: string
  sessionId: number
  setLogId: number
  // 'strength' = new heaviest weight ever for this exercise
  // 'reps'     = more reps than ever achieved at the current max weight
  // Legacy records (pre-v7) are backfilled as 'strength'.
  prType: PRType
}

export interface BodyweightLog {
  id?: number
  weightKg: number
  waistCm?: number
  neckCm?: number
  bodyFatPct?: number
  leanMassKg?: number
  loggedAt: string
}
