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
  computeNextCardio,
  snapToAvailable,
} from '../progression'
import { remainingSeconds } from '../../components/workout/RestTimer'
import { isoWeekStart, setVolume, totalVolume, weeklyVolume } from '../volume'
import { checkPR, checkBodyweightRepPR } from '../pr'

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

// A10 — defensive coverage for the upper==lower case (e.g. DRD's "3×8"
// scheme). The user reported seeing a DECREASE prescription after hitting
// 8/8/8 on this scheme; the underlying 11.25 kg artifact turned out to be
// stale data, not an evaluator bug. These tests pin the correct behavior
// so the same misdiagnosis can't sneak back through a future refactor.
describe('evaluatePerformance — single-number scheme (3×8)', () => {
  const single = { lower: 8, upper: 8, isAmrap: false }

  it('INCREASE when every set lands exactly on target (no overshoot)', () => {
    // The exact case the user observed: DRD 12.5 × 8/8/8 must not return DECREASE.
    expect(evaluatePerformance([8, 8, 8], single)).toBe('INCREASE')
  })

  it('INCREASE_2 when ≥2 sets exceed the target', () => {
    expect(evaluatePerformance([9, 9, 8], single)).toBe('INCREASE_2')
    expect(evaluatePerformance([10, 9, 8], single)).toBe('INCREASE_2')
  })

  it('INCREASE when only one set exceeds the target', () => {
    expect(evaluatePerformance([9, 8, 8], single)).toBe('INCREASE')
  })

  it('DECREASE when even one set drops below', () => {
    expect(evaluatePerformance([7, 8, 8], single)).toBe('DECREASE')
    expect(evaluatePerformance([8, 7, 8], single)).toBe('DECREASE')
  })

  it('does not mistake exact-target for under-target', () => {
    // 8 < 8 must evaluate false — that mistake would push the user backwards
    // even when they hit the prescription perfectly.
    expect(evaluatePerformance([8, 8, 8], single)).not.toBe('DECREASE')
    expect(evaluatePerformance([8, 8, 8], single)).not.toBe('SAME')
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

describe('decideProgression — barbell (no multi-confirm needed)', () => {
  const base = {
    incrementKg: 2.5,
    equipmentType: 'barbell' as const,
    bumpConfirmStreak: 0,
    justBumped: false,
  }

  it('INCREASE bumps by one increment', () => {
    expect(decideProgression({ ...base, basisKg: 50, result: 'INCREASE' })).toMatchObject({
      nextWeightKg: 52.5,
      bumpConfirmStreak: 0,
      justBumped: false,
    })
  })

  it('INCREASE_2 bumps by two increments (barbell only)', () => {
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

describe('decideProgression — dumbbell triple-confirmation (B+)', () => {
  const lightDB = {
    basisKg: 5,
    incrementKg: 2.5,
    equipmentType: 'dumbbell' as const,
    justBumped: false,
  }

  it('first INCREASE on a big-jump dumbbell stays at basis with streak=1', () => {
    expect(decideProgression({ ...lightDB, result: 'INCREASE', bumpConfirmStreak: 0 }))
      .toMatchObject({
        nextWeightKg: 5,
        bumpConfirmStreak: 1,
        justBumped: false,
      })
  })

  it('second INCREASE keeps holding at basis with streak=2', () => {
    expect(decideProgression({ ...lightDB, result: 'INCREASE', bumpConfirmStreak: 1 }))
      .toMatchObject({
        nextWeightKg: 5,
        bumpConfirmStreak: 2,
        justBumped: false,
      })
  })

  it('third INCREASE finally bumps and resets streak', () => {
    expect(decideProgression({ ...lightDB, result: 'INCREASE', bumpConfirmStreak: 2 }))
      .toMatchObject({
        nextWeightKg: 7.5,
        bumpConfirmStreak: 0,
        justBumped: true,
      })
  })

  it('INCREASE_2 on a dumbbell is capped to a single step (no 2.5 → 7.5 overshoot)', () => {
    // streak=2 + INCREASE_2 should still only bump by one step, not two
    expect(decideProgression({
      ...lightDB,
      basisKg: 2.5,
      result: 'INCREASE_2',
      bumpConfirmStreak: 2,
    })).toMatchObject({
      nextWeightKg: 5,         // capped (not 7.5)
      justBumped: true,
    })
  })

  it('SAME clears any pending streak', () => {
    expect(decideProgression({ ...lightDB, result: 'SAME', bumpConfirmStreak: 2 }))
      .toMatchObject({ nextWeightKg: 5, bumpConfirmStreak: 0 })
  })

  it('DECREASE clears any pending streak', () => {
    expect(decideProgression({ ...lightDB, result: 'DECREASE', bumpConfirmStreak: 2 }))
      .toMatchObject({ nextWeightKg: 2.5, bumpConfirmStreak: 0 })
  })

  it('larger dumbbells (<15 % jump) bump immediately, no streak required', () => {
    // 25 kg DB + 2.5 = +10 % → bump in one go
    expect(decideProgression({
      basisKg: 25,
      incrementKg: 2.5,
      equipmentType: 'dumbbell',
      result: 'INCREASE',
      bumpConfirmStreak: 0,
      justBumped: false,
    })).toMatchObject({ nextWeightKg: 27.5, bumpConfirmStreak: 0, justBumped: false })
  })

  it('larger dumbbells also have INCREASE_2 capped to single step', () => {
    // 25 kg DB hitting INCREASE_2 used to bump +5 = 30. Now capped to +2.5 = 27.5.
    expect(decideProgression({
      basisKg: 25,
      incrementKg: 2.5,
      equipmentType: 'dumbbell',
      result: 'INCREASE_2',
      bumpConfirmStreak: 0,
      justBumped: false,
    })).toMatchObject({ nextWeightKg: 27.5 })
  })
})

describe('decideProgression — grace period after a bump', () => {
  it('DECREASE right after a bump becomes SAME (one-session grace)', () => {
    expect(decideProgression({
      basisKg: 7.5,
      incrementKg: 2.5,
      equipmentType: 'dumbbell',
      result: 'DECREASE',
      bumpConfirmStreak: 0,
      justBumped: true,
    })).toMatchObject({
      nextWeightKg: 7.5,
      bumpConfirmStreak: 0,
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
      bumpConfirmStreak: 0,
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

  it('returns empty for dumbbell below 10 kg', () => {
    expect(computeWarmupWeights(5, 'dumbbell')).toEqual([])
  })

  it('returns empty for barbell when total load is below 30 kg', () => {
    // workingKg=4/side → total 28 kg → no warmup
    expect(computeWarmupWeights(4, 'barbell')).toEqual([])
  })

  it('returns two warmups for barbell in the 30–59 kg total band', () => {
    // workingKg=12.5/side → total 45 → 2 warmups @ 50%/75% of per-side
    expect(computeWarmupWeights(12.5, 'barbell')).toEqual([5, 7.5])
    // workingKg=17.5/side → total 55 → 2 warmups
    expect(computeWarmupWeights(17.5, 'barbell')).toEqual([7.5, 12.5])
  })

  it('returns three warmups for barbell at 60 kg total and above', () => {
    // workingKg=20/side → total 60 → 3 warmups @ 40%/60%/80% of per-side
    // 20*0.4=8 → floor 2.5 → 7.5; 20*0.6=12 → 10; 20*0.8=16 → 15
    expect(computeWarmupWeights(20, 'barbell')).toEqual([7.5, 10, 15])
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

  it('honors barWeightKg override for barbell total-load calc', () => {
    // Smith machine: bar=0. 22.5/side → total 45 → 2 warmups (was 65 → 3 with default 20).
    expect(computeWarmupWeights(22.5, 'barbell', 0)).toEqual([10, 15])
    // Smith at 5/side → total 10 → no warmup
    expect(computeWarmupWeights(5, 'barbell', 0)).toEqual([])
    // Olympic default (20) unchanged when barWeight omitted
    expect(computeWarmupWeights(22.5, 'barbell')).toEqual([7.5, 12.5, 17.5])
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

// ─── PR detection ─────────────────────────────────────────────────────────────

describe('checkPR — first set ever', () => {
  it('fires both Strength and Rep PR (new max weight, first reps at it)', () => {
    expect(checkPR({
      weightKg: 60, reps: 5,
      priorMaxWeight: 0, priorMaxRepsAtMaxWeight: 0,
    })).toEqual({ strength: true, reps: true })
  })
})

describe('checkPR — Strength PR', () => {
  it('fires when weight strictly exceeds prior max', () => {
    expect(checkPR({
      weightKg: 65, reps: 3,
      priorMaxWeight: 60, priorMaxRepsAtMaxWeight: 8,
    })).toEqual({ strength: true, reps: true })
  })

  it('does NOT fire when matching prior max weight', () => {
    expect(checkPR({
      weightKg: 60, reps: 8,
      priorMaxWeight: 60, priorMaxRepsAtMaxWeight: 5,
    })).toMatchObject({ strength: false })
  })
})

describe('checkPR — Rep PR', () => {
  it('fires at current max weight when reps exceed prior best', () => {
    expect(checkPR({
      weightKg: 60, reps: 8,
      priorMaxWeight: 60, priorMaxRepsAtMaxWeight: 5,
    })).toEqual({ strength: false, reps: true })
  })

  it('does NOT fire when reps tie the prior best', () => {
    expect(checkPR({
      weightKg: 60, reps: 5,
      priorMaxWeight: 60, priorMaxRepsAtMaxWeight: 5,
    })).toEqual({ strength: false, reps: false })
  })

  it('does NOT fire at lower weight, even if reps are very high', () => {
    // Lateral Raise 2.5 × 20 when 5 kg has been done before — not a PR
    expect(checkPR({
      weightKg: 2.5, reps: 20,
      priorMaxWeight: 5, priorMaxRepsAtMaxWeight: 8,
    })).toEqual({ strength: false, reps: false })
  })
})

describe('checkPR — isolation/high-rep progression', () => {
  it('lateral raise rep progression at the working weight all count', () => {
    // 2.5 × 10 (first ever) → both
    expect(checkPR({
      weightKg: 2.5, reps: 10, priorMaxWeight: 0, priorMaxRepsAtMaxWeight: 0,
    })).toEqual({ strength: true, reps: true })
    // 2.5 × 12 → Rep PR only
    expect(checkPR({
      weightKg: 2.5, reps: 12, priorMaxWeight: 2.5, priorMaxRepsAtMaxWeight: 10,
    })).toEqual({ strength: false, reps: true })
    // 2.5 × 14 → Rep PR
    expect(checkPR({
      weightKg: 2.5, reps: 14, priorMaxWeight: 2.5, priorMaxRepsAtMaxWeight: 12,
    })).toEqual({ strength: false, reps: true })
    // 5 × 8 (jump up in weight) → both
    expect(checkPR({
      weightKg: 5, reps: 8, priorMaxWeight: 2.5, priorMaxRepsAtMaxWeight: 14,
    })).toEqual({ strength: true, reps: true })
    // 2.5 × 16 (regression weight, beats old rep count, but max is now 5) → nothing
    expect(checkPR({
      weightKg: 2.5, reps: 16, priorMaxWeight: 5, priorMaxRepsAtMaxWeight: 8,
    })).toEqual({ strength: false, reps: false })
  })
})

describe('snapToAvailable — equipment increments', () => {
  it('snaps dumbbell weights to the 2.5 kg grid', () => {
    // The 11.25 (10 + old 1.25 increment) case the user actually saw
    expect(snapToAvailable(11.25, 'dumbbell', 'down')).toBe(10)
    expect(snapToAvailable(11.25, 'dumbbell', 'up')).toBe(12.5)
    // 11.25 / 2.5 = 4.5 → Math.round half-up → 5 * 2.5 = 12.5
    expect(snapToAvailable(11.25, 'dumbbell', 'nearest')).toBe(12.5)
  })

  it('rounds half-step values per direction', () => {
    // 6.25 / 2.5 = 2.5 → nearest 3 → 7.5
    expect(snapToAvailable(6.25, 'dumbbell', 'down')).toBe(5)
    expect(snapToAvailable(6.25, 'dumbbell', 'up')).toBe(7.5)
    expect(snapToAvailable(6.25, 'dumbbell', 'nearest')).toBe(7.5)
    // 3.75 / 2.5 = 1.5 → nearest 2 → 5
    expect(snapToAvailable(3.75, 'dumbbell', 'down')).toBe(2.5)
    expect(snapToAvailable(3.75, 'dumbbell', 'up')).toBe(5)
    expect(snapToAvailable(3.75, 'dumbbell', 'nearest')).toBe(5)
  })

  it('snaps machine weights to the 5 kg grid', () => {
    expect(snapToAvailable(27.5, 'machine', 'down')).toBe(25)
    expect(snapToAvailable(27.5, 'machine', 'up')).toBe(30)
    expect(snapToAvailable(32, 'machine', 'nearest')).toBe(30)
  })

  it('snaps barbell to 2.5 kg per side', () => {
    expect(snapToAvailable(42.5, 'barbell', 'nearest')).toBe(42.5) // already on grid
    expect(snapToAvailable(43.75, 'barbell', 'up')).toBe(45)
    expect(snapToAvailable(43.75, 'barbell', 'down')).toBe(42.5)
  })

  it('passes through cardio and bodyweight unchanged', () => {
    expect(snapToAvailable(11.25, 'bodyweight', 'up')).toBe(11.25)
    expect(snapToAvailable(7, 'cardio', 'down')).toBe(7)
  })

  it('returns 0 for non-positive input on weighted equipment', () => {
    expect(snapToAvailable(0, 'dumbbell', 'nearest')).toBe(0)
    expect(snapToAvailable(-2, 'machine', 'down')).toBe(0)
  })

  it('handles values already on the grid without drift', () => {
    expect(snapToAvailable(12.5, 'dumbbell', 'nearest')).toBe(12.5)
    expect(snapToAvailable(30, 'machine', 'up')).toBe(30)
    expect(snapToAvailable(20, 'barbell', 'down')).toBe(20)
  })
})

describe('checkBodyweightRepPR', () => {
  it('fires when reps exceed prior max', () => {
    // Push-Up: prior best 6 reps, this set 8 reps → PR
    expect(checkBodyweightRepPR(8, 6)).toBe(true)
  })

  it('fires on the first ever bodyweight set', () => {
    // priorMaxReps starts at 0 → any positive rep count fires
    expect(checkBodyweightRepPR(6, 0)).toBe(true)
  })

  it('does not fire on a tie', () => {
    // Crunch 40 stable: 40 == 40, no PR
    expect(checkBodyweightRepPR(40, 40)).toBe(false)
  })

  it('does not fire when reps drop below prior max', () => {
    // Push-Up regression: prior 12, this set 10 → not a PR
    expect(checkBodyweightRepPR(10, 12)).toBe(false)
  })
})

describe('computeNextCardio — rotation', () => {
  const start = { durationMin: 30, inclinePct: 7, speedKmh: 5 }

  it('W2 (incline week) bumps incline +1', () => {
    expect(computeNextCardio(start, 2, true, false))
      .toEqual({ durationMin: 30, inclinePct: 8, speedKmh: 5 })
  })

  it('W3 (speed week) — speed already at cap → falls through to incline', () => {
    // start.speedKmh is 5.0 (cap); nominal bump 5.0+0.2=5.2 > cap → no speed
    // change → fall through to incline.
    const w2 = { durationMin: 30, inclinePct: 8, speedKmh: 5 }
    expect(computeNextCardio(w2, 3, true, false))
      .toEqual({ durationMin: 30, inclinePct: 9, speedKmh: 5 })
  })

  it('incline-at-cap, W2 incline week → falls through to speed (but cap blocks that too)', () => {
    const inclineCap = { durationMin: 30, inclinePct: 15, speedKmh: 5 }
    expect(computeNextCardio(inclineCap, 2, true, false))
      .toEqual({ durationMin: 30, inclinePct: 15, speedKmh: 5 })
  })

  it('stays at current values when both axes are capped', () => {
    const bothCap = { durationMin: 30, inclinePct: 15, speedKmh: 5 }
    expect(computeNextCardio(bothCap, 2, true, false)).toEqual(bothCap)
    expect(computeNextCardio(bothCap, 3, true, false)).toEqual(bothCap)
  })

  it('SAME when no ticks last week', () => {
    expect(computeNextCardio(start, 2, false, false)).toEqual(start)
    expect(computeNextCardio(start, 3, false, false)).toEqual(start)
  })

  it('SAME when next week is the deload', () => {
    const w12 = { durationMin: 30, inclinePct: 14, speedKmh: 5 }
    expect(computeNextCardio(w12, 13, true, true)).toEqual(w12)
  })

  it('12-week projection: incline climbs every week (speed cap = start)', () => {
    // With speed cap = start = 5.0, every speed week falls through to
    // incline, so incline effectively bumps +1 every week until cap = 15.
    let p = { durationMin: 30, inclinePct: 7, speedKmh: 5 }
    p = computeNextCardio(p, 2, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 8, speedKmh: 5 })
    p = computeNextCardio(p, 3, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 9, speedKmh: 5 })
    p = computeNextCardio(p, 4, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 10, speedKmh: 5 })
    p = computeNextCardio(p, 5, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 11, speedKmh: 5 })
    p = computeNextCardio(p, 6, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 12, speedKmh: 5 })
    p = computeNextCardio(p, 7, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 13, speedKmh: 5 })
    p = computeNextCardio(p, 8, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 14, speedKmh: 5 })
    p = computeNextCardio(p, 9, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 15, speedKmh: 5 })
    // Now incline is capped; W10 (incline week) bumps nothing.
    p = computeNextCardio(p, 10, true, false)
    expect(p).toEqual({ durationMin: 30, inclinePct: 15, speedKmh: 5 })
  })
})

