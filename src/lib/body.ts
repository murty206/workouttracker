// Hodgdon-Beckett US Navy body fat formula
export function navyBodyFat(
  gender: 'male' | 'female',
  heightCm: number,
  waistCm: number,
  neckCm: number,
  hipCm?: number
): number {
  if (gender === 'male') {
    const density = 1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)
    return (495 / density) - 450
  } else {
    const hip = hipCm ?? waistCm
    const density = 1.29579 - 0.35004 * Math.log10(waistCm + hip - neckCm) + 0.22100 * Math.log10(heightCm)
    return (495 / density) - 450
  }
}

export function leanMass(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100)
}
