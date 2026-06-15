import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const XLSX_PATH = path.join(__dirname, '../Antrenman Programı.xlsx')
const OUT_PATH = path.join(__dirname, '../src/lib/seed-data.ts')

const wb = XLSX.readFile(XLSX_PATH)

function getEquipmentType(name: string): string {
  const lower = name.toLowerCase()
  if (
    lower.includes('crunch') || lower.includes('push-up') || lower.includes('push up') ||
    lower.includes('pull up') || lower.includes('pull-up') || lower.includes('negative pull') ||
    lower.includes('leg raise') || lower.includes('deadbug') || lower.includes('plank')
  ) return 'bodyweight'
  if (lower.startsWith('db ') || lower.startsWith('dumbbell') || lower.includes('dumbbell') ||
      lower.includes('lateral raise') || lower.includes('incline dumbbell') ||
      lower.includes('overhead triceps') || lower.includes('curl')) return 'dumbbell'
  if (lower.includes('lat pulldown') || lower.includes('cable') ||
      lower.includes('chest fly machine') || lower.includes('machine')) return 'machine'
  return 'barbell'
}

function getWeightDisplay(eq: string): string {
  if (eq === 'bodyweight') return 'none'
  if (eq === 'machine') return 'total'
  return 'per-side'
}

function getIncrement(eq: string): number {
  if (eq === 'bodyweight') return 0
  if (eq === 'barbell') return 2.5
  if (eq === 'machine') return 2.5
  return 1.25 // dumbbell
}

function parseRepStr(raw: string): { sets: number; reps: string } {
  const s = String(raw).trim()
  // "4x5+" → sets=4, reps="5+"
  const match = s.match(/^(\d+)x(.+)$/)
  if (match) return { sets: parseInt(match[1]), reps: match[2].trim() }
  return { sets: 3, reps: s }
}

function parseWeight(raw: any): number | null {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().toLowerCase()
  if (s.includes('vücut') || s === '-' || s === '' || s === 'bw') return null
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

function parseWarmups(row: any[]): number[] {
  const result: number[] = []
  for (const idx of [4, 5, 6]) {
    const v = row[idx]
    if (v !== null && v !== undefined && String(v).trim() !== '-' && String(v).trim() !== '') {
      const n = parseFloat(String(v))
      if (!isNaN(n)) result.push(n)
    }
  }
  return result
}

const SKIP_NAMES = new Set(['egzersiz', 'vücut ağırlığı', 'push-up'])

function parseWeekSheet(sheetName: string, weekNumber: number) {
  const ws = wb.Sheets[sheetName]
  if (!ws) return null

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][]

  type WorkoutLabel = 'A' | 'B' | 'C'
  const workouts: { label: WorkoutLabel; exercises: any[] }[] = []
  let current: { label: WorkoutLabel; exercises: any[] } | null = null

  for (const row of rows) {
    const nameCell = row[0]
    if (nameCell === null || nameCell === undefined) continue

    const name = String(nameCell).trim()
    const lower = name.toLowerCase()

    // Detect workout section headers
    const workoutMatch = name.match(/^WORKOUT\s+([ABC])$/i)
    if (workoutMatch) {
      if (current) workouts.push(current)
      current = { label: workoutMatch[1].toUpperCase() as WorkoutLabel, exercises: [] }
      continue
    }

    // Skip known non-exercise rows
    if (SKIP_NAMES.has(lower) || lower.startsWith('egzersiz') || lower.includes('ağırlığı')) continue

    // Must have a rep scheme in col C (index 2)
    const repCell = row[2]
    if (!repCell || !String(repCell).includes('x')) continue

    const { sets, reps } = parseRepStr(String(repCell))
    const weightKg = parseWeight(row[1])
    const eq = getEquipmentType(name)

    if (!current) {
      current = { label: 'A', exercises: [] }
    }

    current.exercises.push({
      exerciseName: name,
      plannedSets: sets,
      plannedReps: reps,
      plannedWeightKg: weightKg,
      warmupWeights: parseWarmups(row),
      orderInWorkout: current.exercises.length,
      equipmentType: eq,
      weightDisplay: getWeightDisplay(eq),
      incrementKg: getIncrement(eq),
    })
  }

  if (current && current.exercises.length > 0) workouts.push(current)

  return { weekNumber, isDeload: weekNumber === 13, workouts }
}

const weekSheets = wb.SheetNames.filter(
  n => n.startsWith('Hafta') || n === 'Dinlenme haftası'
)

const weeks: ReturnType<typeof parseWeekSheet>[] = []
let weekNum = 1
for (const sheetName of weekSheets) {
  const isDeload = sheetName === 'Dinlenme haftası'
  const data = parseWeekSheet(sheetName, isDeload ? 13 : weekNum)
  if (data) {
    weeks.push(data)
    if (!isDeload) weekNum++
  }
}

// An exercise "uses warmups" iff at least one of its scheduled occurrences
// in the spreadsheet had warmup weights in cols E/F/G. The spreadsheet only
// fills those for the main compound lifts; accessories stay empty.
const usesWarmupNames = new Set<string>()
for (const w of weeks) {
  for (const wo of w!.workouts) {
    for (const ex of wo.exercises) {
      if (ex.warmupWeights.length > 0) usesWarmupNames.add(ex.exerciseName)
    }
  }
}

// Collect all unique exercises from Week 1 only (canonical definition)
const week1 = weeks[0]!
const exerciseMap = new Map<string, any>()
for (const wo of week1.workouts) {
  for (const ex of wo.exercises) {
    if (!exerciseMap.has(ex.exerciseName)) {
      exerciseMap.set(ex.exerciseName, {
        name: ex.exerciseName,
        category: ex.equipmentType === 'bodyweight' ? 'bodyweight' : ex.equipmentType === 'machine' ? 'machine' : 'strength',
        primaryMuscle: 'general',
        equipmentType: ex.equipmentType,
        weightDisplay: ex.weightDisplay,
        incrementKg: ex.incrementKg,
        isCustom: false,
        usesWarmup: usesWarmupNames.has(ex.exerciseName),
      })
    }
  }
}

// Strip equipment metadata from week data (seed.ts will look up by name)
const cleanWeeks = weeks.map(w => ({
  weekNumber: w!.weekNumber,
  isDeload: w!.isDeload,
  workouts: w!.workouts.map(wo => ({
    label: wo.label,
    exercises: wo.exercises.map(({ exerciseName, plannedSets, plannedReps, plannedWeightKg, warmupWeights, orderInWorkout }) => ({
      exerciseName, plannedSets, plannedReps, plannedWeightKg, warmupWeights, orderInWorkout,
    })),
  })),
}))

const output = `// AUTO-GENERATED by scripts/parse-xlsx.ts — do not edit manually
import type { EquipmentType, WeightDisplay } from '@/types'

export interface SeedExercise {
  name: string
  category: string
  primaryMuscle: string
  equipmentType: EquipmentType
  weightDisplay: WeightDisplay
  incrementKg: number
  isCustom: boolean
  usesWarmup?: boolean
}

export interface SeedTemplateExercise {
  exerciseName: string
  plannedSets: number
  plannedReps: string
  plannedWeightKg: number | null
  warmupWeights: number[]
  orderInWorkout: number
}

export interface SeedWorkout {
  label: 'A' | 'B' | 'C'
  exercises: SeedTemplateExercise[]
}

export interface SeedWeek {
  weekNumber: number
  isDeload: boolean
  workouts: SeedWorkout[]
}

export const SEED_EXERCISES: SeedExercise[] = ${JSON.stringify(Array.from(exerciseMap.values()), null, 2)}

export const SEED_PROGRAM = {
  name: 'Superhero Antrenman Programı',
  totalWeeks: 12,
}

export const SEED_WEEKS: SeedWeek[] = ${JSON.stringify(cleanWeeks, null, 2)}
`

fs.writeFileSync(OUT_PATH, output)
console.log(`✓ Wrote seed data to ${OUT_PATH}`)
weeks.forEach(w => {
  console.log(`  Week ${w!.weekNumber}: ${w!.workouts.map(wo => `${wo.label}(${wo.exercises.length}ex)`).join(', ')}`)
})
