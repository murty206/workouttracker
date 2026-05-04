'use client'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { strengthScore } from '@/lib/score'

export function StrengthScoreCard() {
  const data = useLiveQuery(async () => {
    const genderPref = await db.userPrefs.get('gender')
    const gender = genderPref?.value as 'male' | 'female' | undefined
    if (!gender) return null

    const latestBW = await db.bodyweightLogs.orderBy('loggedAt').last()
    if (!latestBW) return null

    const score = await strengthScore(gender, latestBW.weightKg)
    return { score, gender, bodyweightKg: latestBW.weightKg }
  }, [])

  if (data === undefined) return null

  if (data === null) {
    return (
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 text-center space-y-1">
        <p className="text-sm font-semibold">Strength Score</p>
        <p className="text-xs text-[#888888]">Set your gender in Settings and log a body weight to see your score</p>
      </div>
    )
  }

  const { score } = data
  const LIFT_LABELS: Record<string, string> = {
    'Bench Press': 'Bench',
    'Squat': 'Squat',
    'Over Head Press': 'OHP',
    'Barbell Row': 'Row',
  }

  function levelLabel(total: number) {
    if (total < 100) return { label: 'Beginner', color: '#888888' }
    if (total < 200) return { label: 'Intermediate', color: '#3b82f6' }
    if (total < 350) return { label: 'Advanced', color: '#22c55e' }
    return { label: 'Elite', color: '#f97316' }
  }

  const level = levelLabel(score.total)

  return (
    <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Strength Score</p>
          <p className="text-xs text-[#888888]">Bench · Squat · OHP · Row</p>
        </div>
        <span className="text-xs text-[#888888]">DOTS</span>
      </div>

      <div className="text-center">
        <p className="text-5xl font-bold text-[#f97316]">{score.total}</p>
        <p className="text-sm font-semibold mt-1" style={{ color: level.color }}>{level.label}</p>
        <p className="text-xs text-[#888888] mt-0.5">normalized by bodyweight &amp; gender</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {Object.entries(score.breakdown).map(([name, val]) => (
          <div key={name} className="bg-[#242424] rounded-xl p-2 text-center">
            <p className="text-xs text-[#888888]">{LIFT_LABELS[name] ?? name}</p>
            <p className="text-sm font-semibold mt-0.5">
              {val !== null ? val : <span className="text-[#444444]">—</span>}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
