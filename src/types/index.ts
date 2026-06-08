export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight'
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
  // readyForBump: first time we hit the upper rep target on a dumbbell where
  // the next weight would be a >15% jump — algorithm holds the bump until
  // the user confirms on a second consecutive session.
  // justBumped: last applyProgression actually bumped this exercise; grants
  // a one-session DECREASE grace so the user doesn't oscillate around a
  // big jump.
  readyForBump?: boolean
  justBumped?: boolean
  // True for exercises whose performance depends on a physical setup the user
  // chooses each session (e.g. inverted row bar height). Surfaces a small
  // "setup note" input above the working sets; the string is saved on each
  // SetLog for that session.
  requiresSetupNote?: boolean
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

export interface PersonalRecord {
  id?: number
  exerciseId: number
  weightKg: number | null
  reps: number
  estimatedOneRepMax: number
  achievedAt: string
  sessionId: number
  setLogId: number
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
