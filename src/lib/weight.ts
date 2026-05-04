import type { EquipmentType } from '@/types'

export function formatWeight(kg: number | null, equipmentType: EquipmentType): string {
  if (equipmentType === 'bodyweight' || kg === null) return 'BW'
  if (equipmentType === 'machine') return `${kg} kg`
  return `${kg} kg/side`
}

export function weightLabel(equipmentType: EquipmentType): string {
  if (equipmentType === 'bodyweight') return ''
  if (equipmentType === 'machine') return 'kg (total)'
  return 'kg/side'
}

export function equipmentTypeFromName(name: string): EquipmentType {
  const lower = name.toLowerCase()
  if (lower.startsWith('db ') || lower.startsWith('dumbbell')) return 'dumbbell'
  if (
    lower.includes('lat pulldown') ||
    lower.includes('cable') ||
    lower.includes('machine')
  ) return 'machine'
  if (
    lower.includes('crunch') ||
    lower.includes('push-up') ||
    lower.includes('push up') ||
    lower.includes('pull up') ||
    lower.includes('pull-up') ||
    lower.includes('bodyweight') ||
    lower.includes('plank')
  ) return 'bodyweight'
  return 'barbell'
}

export function weightDisplayFromEquipment(eq: EquipmentType): import('@/types').WeightDisplay {
  if (eq === 'bodyweight') return 'none'
  if (eq === 'machine') return 'total'
  return 'per-side'
}

export function incrementForEquipment(eq: EquipmentType, name: string): number {
  if (eq === 'bodyweight') return 0
  if (eq === 'barbell') return 2.5
  if (eq === 'machine') return 2.5
  // dumbbell: compound vs isolation
  const lower = name.toLowerCase()
  const isCompound = lower.includes('romanian') || lower.includes('rdl') || lower.includes('lunge')
  return isCompound ? 1.25 : 1.25
}
