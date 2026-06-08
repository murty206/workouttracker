import { describe, it, expect } from 'vitest'
import { plateMath, plateBreakdownLabel } from '../plates'
import { epley, dotsScore } from '../score'
import {
  parseRepScheme,
  evaluatePerformance,
  computeWarmupWeights,
  median,
  decideProgression,
  computeDeloadWeight,
} from '../progression'
import { remainingSeconds } from '../../components/workout/RestTimer'
import { isoWeekStart, setVolume, totalVolume, weeklyVolume } from '../volume'

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
    expect(parseRepScheme('8')).toEqual({ lower: 8, upper: 8, isAmrap: false })
  })

  it('parses a range "8-12"', () => {
    expect(parseRepScheme('8-12')).toEqual({ lower: 8, upper: 12, isAmrap: false })
  })

  it('parses open-ended "5+" with isAmrap flag', () => {
    expect(parseRepScheme('5+')).toEqual({ lower: 5, upper: null, isAmrap: true })
  })

  it('returns null for "max"', () => {
    expect(parseRepScheme('max')).toBeNull()
  })
})

// ─── Progression evaluation ───────────────────────────────────────────────────

describe('evaluatePerformance — standard scheme (8-12)', () => {
  const scheme = { lower: 8, upper: 12, isAmrap: false }

  it('INCREASE when every set hits the upper exactly', () => {
    expect(evaluatePerformance([12, 12, 12], scheme)).toBe('INCREASE')
  })

  it('INCREASE when every set ≥ upper but only one set exceeds it', () => {
    expect(evaluatePerformance([13, 12, 12], scheme)).toBe('INCREASE')
  })

  it('INCREASE_2 when every set ≥ upper AND ≥2 sets exceed', () => {
    expect(evaluatePerformance([13, 13, 12], scheme)).toBe('INCREASE_2')
    expect(evaluatePerformance([15, 14, 13], scheme)).toBe('INCREASE_2')
  })

  it('SAME when reps land inside the range without hitting upper on every set', () => {
    expect(evaluatePerformance([10, 11, 12], scheme)).toBe('SAME')
    expect(evaluatePerformance([9, 9, 9], scheme)).toBe('SAME')
  })

  it('SAME when one set falls to the lower bound but no set is below it', () => {
    expect(evaluatePerformance([8, 12, 12], scheme)).toBe('SAME')
  })

  it('DECREASE when the worst set drops below lower', () => {
    expect(evaluatePerformance([7, 12, 12], scheme)).toBe('DECREASE')
    expect(evaluatePerformance([3, 3, 3], scheme)).toBe('DECREASE')
  })
})

describe('evaluatePerformance — fixed scheme (5×5)', () => {
  const fixed = { lower: 5, upper: 5, isAmrap: false }

  it('INCREASE when all sets exactly hit target', () => {
    expect(evaluatePerformance([5, 5, 5, 5, 5], fixed)).toBe('INCREASE')
  })

  it('INCREASE_2 when ≥2 sets exceed target', () => {
    expect(evaluatePerformance([6, 6, 5, 5, 5], fixed)).toBe('INCREASE_2')
  })

  it('DECREASE on any set below target', () => {
    expect(evaluatePerformance([4, 5, 5, 5, 5], fixed)).toBe('DECREASE')
  })
})

describe('evaluatePerformance — AMRAP (5+)', () => {
  const amrap = { lower: 5, upper: null, isAmrap: true }

  it('DECREASE when last set is below lower', () => {
    expect(evaluatePerformance([5, 5, 5, 4], amrap)).toBe('DECREASE')
  })

  it('SAME when last set ≥ lower but < 1.5× lower', () => {
    expect(evaluatePerformance([5, 5, 5, 6], amrap)).toBe('SAME')
    expect(evaluatePerformance([5, 5, 5, 7], amrap)).toBe('SAME') // 5*1.5 = 7.5, 7 < 7.5
  })

  it('INCREASE when last set ≥ 1.5× lower', () => {
    expect(evaluatePerformance([5, 5, 5, 8], amrap)).toBe('INCREASE') // 8 ≥ 7.5
  })

  it('INCREASE_2 when last set ≥ 2× lower (the AMRAP overshoot)', () => {
    expect(evaluatePerformance([5, 5, 5, 10], amrap)).toBe('INCREASE_2')
    expect(evaluatePerformance([7, 7, 7, 20], { lower: 7, upper: null, isAmrap: true }))
      .toBe('INCREASE_2') // 20 ≥ 14, Squat 22.5×20 scenario
  })
})

describe('evaluatePerformance — empty input', () => {
  it('returns SAME when no reps were logged', () => {
    expect(evaluatePerformance([], { lower: 5, upper: 5, isAmrap: false })).toBe('SAME')
  })
})

describe('decideProgression — barbell (no double-confirm needed)', () => {
  const base = {
    incrementKg: 2.5,
    equipmentType: 'barbell' as const,
    readyForBump: false,
    justBumped: false,
  }

  it('INCREASE bumps by one increment', () => {
    expect(decideProgression({ ...base, basisKg: 50, result: 'INCREASE' })).toMatchObject({
      nextWeightKg: 52.5,
      readyForBump: false,
      justBumped: false,
    })
  })

  it('INCREASE_2 bumps by two increments', () => {
    expect(decideProgression({ ...base, basisKg: 50, result: 'INCREASE_2' })).toMatchObject({
      nextWeightKg: 55,
    })
  })

  it('DECREASE drops one increment', () => {
    expect(decideProgression({ ...base, basisKg: 50, result: 'DECREASE' })).toMatchObject({
      nextWeightKg: 47.5,
    })
  })

  it('SAME keeps the basis', () => {
    expect(decideProgression({ ...base, basisKg: 50, result: 'SAME' })).toMatchObject({
      nextWeightKg: 50,
    })
  })
})

describe('decideProgression — dumbbell double-confirmation', () => {
  const lightDB = {
    basisKg: 5,
    incrementKg: 2.5,
    equipmentType: 'dumbbell' as const,
    justBumped: false,
  }

  it('first INCREASE on a big-jump dumbbell stays at basis and arms ready flag', () => {
    expect(decideProgression({ ...lightDB, result: 'INCREASE', readyForBump: false }))
      .toMatchObject({
        nextWeightKg: 5,
        readyForBump: true,
        justBumped: false,
      })
  })

  it('second INCREASE confirms the bump and sets grace flag', () => {
    expect(decideProgression({ ...lightDB, result: 'INCREASE', readyForBump: true }))
      .toMatchObject({
        nextWeightKg: 7.5,
        readyForBump: false,
        justBumped: true,
      })
  })

  it('big jump applies to INCREASE_2 too', () => {
    // 5 + 5 = 10 (+100%) — still requires double-confirm
    expect(decideProgression({ ...lightDB, result: 'INCREASE_2', readyForBump: false }))
      .toMatchObject({ nextWeightKg: 5, readyForBump: true })
    expect(decideProgression({ ...lightDB, result: 'INCREASE_2', readyForBump: true }))
      .toMatchObject({ nextWeightKg: 10, readyForBump: false, justBumped: true })
  })

  it('SAME clears a pending ready flag (no free confirmation from a middle-range session)', () => {
    expect(decideProgression({ ...lightDB, result: 'SAME', readyForBump: true }))
      .toMatchObject({ nextWeightKg: 5, readyForBump: false })
  })

  it('larger dumbbells (>15% jump bar) bump normally without double-confirm', () => {
    // 25 kg DB + 2.5 = +10 % → bump in one go
    expect(decideProgression({
      basisKg: 25,
      incrementKg: 2.5,
      equipmentType: 'dumbbell',
      result: 'INCREASE',
      readyForBump: false,
      justBumped: false,
    })).toMatchObject({ nextWeightKg: 27.5, readyForBump: false, justBumped: false })
  })
})

describe('decideProgression — grace period after a bump', () => {
  it('DECREASE right after a bump becomes SAME (one-session grace)', () => {
    expect(decideProgression({
      basisKg: 7.5,
      incrementKg: 2.5,
      equipmentType: 'dumbbell',
      result: 'DECREASE',
      readyForBump: false,
      justBumped: true,
    })).toMatchObject({
      nextWeightKg: 7.5,
      readyForBump: false,
      justBumped: false,
      reason: 'grace',
    })
  })

  it('DECREASE without grace drops one increment', () => {
    expect(decideProgression({
      basisKg: 7.5,
      incrementKg: 2.5,
      equipmentType: 'dumbbell',
      result: 'DECREASE',
      readyForBump: false,
      justBumped: false,
    })).toMatchObject({ nextWeightKg: 5, justBumped: false })
  })
})

// ─── Warmup tiers ─────────────────────────────────────────────────────────────

describe('computeWarmupWeights', () => {
  it('returns empty for bodyweight regardless of weight', () => {
    expect(computeWarmupWeights(100, 'bodyweight')).toEqual([])
    expect(computeWarmupWeights(0, 'bodyweight')).toEqual([])
  })

  it('returns empty when working weight is below 10 kg', () => {
    expect(computeWarmupWeights(5, 'dumbbell')).toEqual([])
    expect(computeWarmupWeights(9.99, 'barbell')).toEqual([])
  })

  it('returns one warmup in the 10–20 kg band', () => {
    expect(computeWarmupWeights(15, 'barbell')).toEqual([7.5])
  })

  it('returns two warmups in the 20–40 kg band', () => {
    expect(computeWarmupWeights(25, 'barbell')).toEqual([12.5, 17.5])
  })

  it('returns three warmups at 40 kg and above', () => {
    expect(computeWarmupWeights(50, 'barbell')).toEqual([20, 30, 40])
  })

  it('rounds down to the nearest 2.5 kg for barbell/dumbbell', () => {
    // 0.75 * 25 = 18.75 → floors to 17.5 (NOT 20)
    expect(computeWarmupWeights(25, 'dumbbell')).toEqual([12.5, 17.5])
  })

  it('rounds down to the nearest 5 kg for machines', () => {
    // 0.5 * 25 = 12.5 → 10; 0.75 * 25 = 18.75 → 15
    expect(computeWarmupWeights(25, 'machine')).toEqual([10, 15])
    // 0.4 * 100 = 40; 0.6 * 100 = 60; 0.8 * 100 = 80
    expect(computeWarmupWeights(100, 'machine')).toEqual([40, 60, 80])
  })
})

// ─── Rest timer math ──────────────────────────────────────────────────────────

describe('remainingSeconds', () => {
  it('returns 0 when no timer is running', () => {
    expect(remainingSeconds(Date.now(), null, 0)).toBe(0)
    expect(remainingSeconds(Date.now(), null, 60_000)).toBe(0)
  })

  it('returns full duration immediately after start', () => {
    const start = 1_000_000
    expect(remainingSeconds(start, start, 60_000)).toBe(60)
  })

  it('counts down based on wall-clock time, immune to throttling', () => {
    // Simulate 45s passing between start and now (as if the tab was backgrounded).
    const start = 1_000_000
    expect(remainingSeconds(start + 45_000, start, 60_000)).toBe(15)
  })

  it('returns 0 once the timer has elapsed', () => {
    const start = 1_000_000
    expect(remainingSeconds(start + 60_000, start, 60_000)).toBe(0)
    expect(remainingSeconds(start + 90_000, start, 60_000)).toBe(0)
  })

  it('rounds partial seconds up so the display ticks at the second boundary', () => {
    const start = 1_000_000
    expect(remainingSeconds(start + 500, start, 60_000)).toBe(60)
    expect(remainingSeconds(start + 1_500, start, 60_000)).toBe(59)
  })
})

// ─── Auto-regulation median ───────────────────────────────────────────────────

describe('median', () => {
  it('returns 0 on empty input', () => {
    expect(median([])).toBe(0)
  })

  it('returns the single value for length 1', () => {
    expect(median([22.5])).toBe(22.5)
  })

  it('returns the middle for odd length', () => {
    // user planned 15, lifted [17.5, 20, 22.5] — median 20 → prompt to bump baseline
    expect(median([17.5, 20, 22.5])).toBe(20)
  })

  it('averages the two middle values for even length', () => {
    expect(median([10, 15, 20, 25])).toBe(17.5)
  })

  it('is order-independent', () => {
    expect(median([25, 15, 10, 20])).toBe(17.5)
  })
})

// ─── Volume tracking ──────────────────────────────────────────────────────────

describe('isoWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    // 2026-06-03 is a Wednesday → Monday of that week is 2026-06-01
    expect(isoWeekStart(new Date(2026, 5, 3))).toBe('2026-06-01')
  })

  it('returns the same date when given a Monday', () => {
    // 2026-06-01 is a Monday
    expect(isoWeekStart(new Date(2026, 5, 1))).toBe('2026-06-01')
  })

  it('rolls Sunday back to the prior Monday (not forward)', () => {
    // 2026-06-07 is Sunday → Monday 2026-06-01 (same ISO week)
    expect(isoWeekStart(new Date(2026, 5, 7))).toBe('2026-06-01')
  })

  it('handles month/year boundary', () => {
    // 2026-01-01 is Thursday → Monday is 2025-12-29
    expect(isoWeekStart(new Date(2026, 0, 1))).toBe('2025-12-29')
  })
})

describe('setVolume', () => {
  it('returns weight × reps for a working set', () => {
    expect(setVolume({ loggedAt: '', weightKg: 50, reps: 10, isWarmup: false })).toBe(500)
  })

  it('returns 0 for warmups', () => {
    expect(setVolume({ loggedAt: '', weightKg: 50, reps: 5, isWarmup: true })).toBe(0)
  })

  it('returns 0 for bodyweight sets (weight null)', () => {
    expect(setVolume({ loggedAt: '', weightKg: null, reps: 12, isWarmup: false })).toBe(0)
  })

  it('returns 0 when weight is 0', () => {
    expect(setVolume({ loggedAt: '', weightKg: 0, reps: 10, isWarmup: false })).toBe(0)
  })
})

describe('totalVolume', () => {
  it('sums working sets and ignores warmups + bodyweight', () => {
    expect(totalVolume([
      { loggedAt: '', weightKg: 50, reps: 10, isWarmup: false },  // 500
      { loggedAt: '', weightKg: 20, reps: 5, isWarmup: true },    // warmup, 0
      { loggedAt: '', weightKg: null, reps: 12, isWarmup: false }, // bodyweight, 0
      { loggedAt: '', weightKg: 60, reps: 8, isWarmup: false },   // 480
    ])).toBe(980)
  })

  it('returns 0 for an empty list', () => {
    expect(totalVolume([])).toBe(0)
  })
})

describe('weeklyVolume', () => {
  it('buckets sets by ISO week and sums volume', () => {
    const result = weeklyVolume([
      // Week of 2026-06-01: Mon 50×10 + Wed 60×8 = 500 + 480 = 980
      { loggedAt: '2026-06-01T10:00:00Z', weightKg: 50, reps: 10, isWarmup: false },
      { loggedAt: '2026-06-03T10:00:00Z', weightKg: 60, reps: 8, isWarmup: false },
      // Week of 2026-06-08: Mon 55×10 = 550
      { loggedAt: '2026-06-08T10:00:00Z', weightKg: 55, reps: 10, isWarmup: false },
    ])
    expect(result).toEqual([
      { weekStart: '2026-06-01', volume: 980 },
      { weekStart: '2026-06-08', volume: 550 },
    ])
  })

  it('excludes warmups and bodyweight sets', () => {
    const result = weeklyVolume([
      { loggedAt: '2026-06-01T10:00:00Z', weightKg: 50, reps: 5, isWarmup: true },
      { loggedAt: '2026-06-01T10:00:00Z', weightKg: null, reps: 12, isWarmup: false },
      { loggedAt: '2026-06-01T10:00:00Z', weightKg: 60, reps: 8, isWarmup: false },
    ])
    expect(result).toEqual([{ weekStart: '2026-06-01', volume: 480 }])
  })

  it('returns sorted weeks ascending', () => {
    const result = weeklyVolume([
      { loggedAt: '2026-06-08T10:00:00Z', weightKg: 50, reps: 10, isWarmup: false },
      { loggedAt: '2026-05-25T10:00:00Z', weightKg: 50, reps: 10, isWarmup: false },
      { loggedAt: '2026-06-01T10:00:00Z', weightKg: 50, reps: 10, isWarmup: false },
    ])
    expect(result.map(r => r.weekStart)).toEqual(['2026-05-25', '2026-06-01', '2026-06-08'])
  })

  it('returns an empty array when no qualifying sets exist', () => {
    expect(weeklyVolume([])).toEqual([])
    expect(weeklyVolume([
      { loggedAt: '2026-06-01T10:00:00Z', weightKg: null, reps: 10, isWarmup: false },
    ])).toEqual([])
  })
})

// ─── Deload computation ───────────────────────────────────────────────────────

describe('computeDeloadWeight', () => {
  it('returns 50% of basis floored to 2.5 kg for barbell', () => {
    expect(computeDeloadWeight(60, 'barbell')).toBe(30)
    expect(computeDeloadWeight(80, 'barbell')).toBe(40)
  })

  it('floors down (never up) when the 50% lands between increments', () => {
    // 17.5 × 0.5 = 8.75 → floor to 7.5 (not 10)
    expect(computeDeloadWeight(17.5, 'barbell')).toBe(7.5)
  })

  it('uses 5 kg steps for machines', () => {
    // 40 × 0.5 = 20 → 20 (already on grid)
    expect(computeDeloadWeight(40, 'machine')).toBe(20)
    // 27.5 × 0.5 = 13.75 → floor to 10
    expect(computeDeloadWeight(27.5, 'machine')).toBe(10)
  })

  it('uses 2.5 kg steps for dumbbell', () => {
    // 12.5 × 0.5 = 6.25 → floor to 5
    expect(computeDeloadWeight(12.5, 'dumbbell')).toBe(5)
  })

  it('returns 0 for non-positive input', () => {
    expect(computeDeloadWeight(0, 'barbell')).toBe(0)
    expect(computeDeloadWeight(-5, 'barbell')).toBe(0)
  })

  it('returns 0 when 50% rounds below the smallest step', () => {
    // 2 × 0.5 = 1 → floor to 0
    expect(computeDeloadWeight(2, 'barbell')).toBe(0)
  })
})
