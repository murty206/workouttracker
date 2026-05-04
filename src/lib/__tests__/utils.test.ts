import { describe, it, expect } from 'vitest'
import { plateMath, plateBreakdownLabel } from '../plates'
import { epley, dotsScore } from '../score'
import { parseRepScheme, evaluatePerformance } from '../progression'

// ─── Plate math ───────────────────────────────────────────────────────────────

describe('plateMath', () => {
  it('returns empty for zero weight', () => {
    expect(plateMath(0)).toEqual([])
  })

  it('handles a single plate exactly', () => {
    expect(plateMath(25)).toEqual([25])
  })

  it('handles 42.5 kg/side (classic squat setup)', () => {
    expect(plateMath(42.5)).toEqual([25, 15, 2.5])
  })

  it('handles 20 kg/side', () => {
    expect(plateMath(20)).toEqual([20])
  })

  it('handles 27.5 kg/side', () => {
    expect(plateMath(27.5)).toEqual([25, 2.5])
  })

  it('handles 60 kg/side', () => {
    expect(plateMath(60)).toEqual([25, 25, 10])
  })

  it('returns nothing for negative input', () => {
    expect(plateMath(-5)).toEqual([])
  })
})

describe('plateBreakdownLabel', () => {
  it('formats 42.5 as 25+15+2.5', () => {
    expect(plateBreakdownLabel(42.5)).toBe('25+15+2.5')
  })

  it('returns empty string for zero', () => {
    expect(plateBreakdownLabel(0)).toBe('')
  })

  it('formats single plate', () => {
    expect(plateBreakdownLabel(25)).toBe('25')
  })
})

// ─── Epley 1RM ────────────────────────────────────────────────────────────────

describe('epley', () => {
  it('returns weight unchanged for 1 rep', () => {
    expect(epley(100, 1)).toBe(100)
  })

  it('computes correctly for 5 reps at 80 kg', () => {
    // 80 * (1 + 5/30) = 80 * 1.1667 = 93.33
    expect(epley(80, 5)).toBeCloseTo(93.33, 1)
  })

  it('computes correctly for 10 reps at 60 kg', () => {
    // 60 * (1 + 10/30) = 60 * 1.333 = 80
    expect(epley(60, 10)).toBeCloseTo(80, 1)
  })

  it('higher reps → higher estimated 1RM for same weight', () => {
    expect(epley(60, 10)).toBeGreaterThan(epley(60, 5))
  })
})

// ─── DOTS score ───────────────────────────────────────────────────────────────

describe('dotsScore', () => {
  it('returns a positive number for a typical male lifter', () => {
    const score = dotsScore(200, 80, 'male')
    expect(score).toBeGreaterThan(0)
  })

  it('returns a positive number for a typical female lifter', () => {
    const score = dotsScore(120, 60, 'female')
    expect(score).toBeGreaterThan(0)
  })

  it('higher total → higher score (same bodyweight)', () => {
    expect(dotsScore(300, 80, 'male')).toBeGreaterThan(dotsScore(200, 80, 'male'))
  })

  it('male and female scores differ for same lift and bodyweight', () => {
    const male = dotsScore(200, 75, 'male')
    const female = dotsScore(200, 75, 'female')
    expect(male).not.toBeCloseTo(female, 0)
  })

  it('score scales linearly with total lifted', () => {
    const s1 = dotsScore(100, 80, 'male')
    const s2 = dotsScore(200, 80, 'male')
    expect(s2 / s1).toBeCloseTo(2, 5)
  })
})

// ─── Rep scheme parsing ───────────────────────────────────────────────────────

describe('parseRepScheme', () => {
  it('parses fixed reps "8"', () => {
    expect(parseRepScheme('8')).toEqual({ lower: 8, upper: 8 })
  })

  it('parses a range "8-12"', () => {
    expect(parseRepScheme('8-12')).toEqual({ lower: 8, upper: 12 })
  })

  it('parses open-ended "5+"', () => {
    expect(parseRepScheme('5+')).toEqual({ lower: 5, upper: null })
  })

  it('returns null for "max"', () => {
    expect(parseRepScheme('max')).toBeNull()
  })
})

// ─── Progression evaluation ───────────────────────────────────────────────────

describe('evaluatePerformance', () => {
  // 3 sets × 8-12 reps → target max = 36, target min = 3×8×0.8 = 19.2
  const scheme = { lower: 8, upper: 12 }
  const sets = 3

  it('INCREASE when all sets hit upper rep target (36 reps)', () => {
    expect(evaluatePerformance(36, sets, scheme)).toBe('INCREASE')
  })

  it('INCREASE when reps exceed upper target', () => {
    expect(evaluatePerformance(40, sets, scheme)).toBe('INCREASE')
  })

  it('SAME when reps are in the middle range', () => {
    expect(evaluatePerformance(27, sets, scheme)).toBe('SAME')
  })

  it('SAME at exactly the minimum threshold (19.2 → 20)', () => {
    expect(evaluatePerformance(20, sets, scheme)).toBe('SAME')
  })

  it('DECREASE when reps fall below 80% of lower range', () => {
    expect(evaluatePerformance(18, sets, scheme)).toBe('DECREASE')
  })

  it('DECREASE when reps are very low', () => {
    expect(evaluatePerformance(5, sets, scheme)).toBe('DECREASE')
  })

  it('handles fixed rep scheme (5×5)', () => {
    const fixed = { lower: 5, upper: 5 }
    expect(evaluatePerformance(25, 5, fixed)).toBe('INCREASE')
    expect(evaluatePerformance(22, 5, fixed)).toBe('SAME')
    expect(evaluatePerformance(18, 5, fixed)).toBe('DECREASE')
  })

  it('handles open-ended scheme ("5+") using 1.5× lower as effective upper', () => {
    // effective upper = Math.round(5 * 1.5) = 8 → target max = 3 × 8 = 24; target min = 3×5×0.8 = 12
    const openScheme = { lower: 5, upper: null }
    expect(evaluatePerformance(24, 3, openScheme)).toBe('INCREASE')
    expect(evaluatePerformance(15, 3, openScheme)).toBe('SAME')
    expect(evaluatePerformance(11, 3, openScheme)).toBe('DECREASE')
  })
})
