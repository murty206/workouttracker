// Volume = Σ(weight × reps) across working sets. Warmups and bodyweight
// (weight === null) sets are excluded.

export interface VolumeLog {
  loggedAt: string
  weightKg: number | null
  reps: number
  isWarmup: boolean
}

// YYYY-MM-DD of the Monday of the ISO week containing `date`. Operates in
// local time, which matches how the user thinks about workout days.
export function isoWeekStart(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0=Sun, 1=Mon, …, 6=Sat
  const offset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + offset)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function setVolume(log: VolumeLog): number {
  if (log.isWarmup || log.weightKg === null || log.weightKg === 0) return 0
  return log.weightKg * log.reps
}

export function totalVolume(logs: VolumeLog[]): number {
  return logs.reduce((sum, l) => sum + setVolume(l), 0)
}

export function weeklyVolume(
  logs: VolumeLog[],
): { weekStart: string; volume: number }[] {
  const weeks = new Map<string, number>()
  for (const log of logs) {
    const v = setVolume(log)
    if (v === 0) continue
    const week = isoWeekStart(new Date(log.loggedAt))
    weeks.set(week, (weeks.get(week) ?? 0) + v)
  }
  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, volume]) => ({ weekStart, volume: Math.round(volume) }))
}
