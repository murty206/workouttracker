// US Navy body fat formula
export function navyBodyFat(
  gender: 'male' | 'female',
  heightCm: number,
  waistCm: number,
  neckCm: number,
  hipCm?: number
): number {
  if (gender === 'male') {
    return 86.010 * Math.log10(waistCm - neckCm) - 70.041 * Math.log10(heightCm) + 36.76
  } else {
    const hip = hipCm ?? waistCm
    return 163.205 * Math.log10(waistCm + hip - neckCm) - 97.684 * Math.log10(heightCm) - 78.387
  }
}

export function leanMass(weightKg: number, bodyFatPct: number): number {
  return weightKg * (1 - bodyFatPct / 100)
}
