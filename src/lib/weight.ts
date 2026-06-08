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
