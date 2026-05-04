export type EquipmentType = 'barbell' | 'dumbbell' | 'machine' | 'bodyweight'
export type WeightDisplay = 'per-side' | 'total' | 'none'
export type WorkoutLabel = 'A' | 'B' | 'C'
export type ProgressionResult = 'INCREASE' | 'SAME' | 'DECREASE'

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
  loggedAt: string
}
