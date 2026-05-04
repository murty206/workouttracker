const AVAILABLE_PLATES = [25, 20, 15, 10, 5, 2.5]

export function plateMath(perSideKg: number): number[] {
  const result: number[] = []
  let remaining = Math.max(0, perSideKg)
  for (const plate of AVAILABLE_PLATES) {
    while (remaining >= plate - 0.001) {
      result.push(plate)
      remaining = Math.round((remaining - plate) * 1000) / 1000
    }
  }
  return result
}

export function plateBreakdownLabel(perSideKg: number): string {
  const plates = plateMath(perSideKg)
  if (!plates.length) return ''
  return plates.join('+')
}
