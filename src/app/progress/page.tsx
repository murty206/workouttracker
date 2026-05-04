'use client'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { ExerciseChart } from '@/components/progress/ExerciseChart'
import { BodyweightChart } from '@/components/progress/BodyweightChart'
import { StrengthScoreCard } from '@/components/progress/StrengthScoreCard'
import { ConsistencyCard } from '@/components/progress/ConsistencyCard'

export default function ProgressPage() {
  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(null)

  const exercises = useLiveQuery(async () => {
    const all = await db.exercises.toArray()
    return all.filter(e => e.equipmentType !== 'bodyweight')
  }, [])

  const bwLogs = useLiveQuery(() => db.bodyweightLogs.orderBy('loggedAt').toArray(), [])

  return (
    <div className="py-6 space-y-6">
      <h1 className="text-2xl font-bold">Progress</h1>

      {/* Strength score */}
      <section>
        <p className="text-xs text-[#888888] uppercase tracking-wider mb-3">Performance</p>
        <StrengthScoreCard />
      </section>

      {/* Consistency */}
      <section>
        <ConsistencyCard />
      </section>

      {/* Body weight chart */}
      {bwLogs && bwLogs.length >= 2 && (
        <section>
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-3">Body Weight</p>
          <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4">
            <BodyweightChart logs={bwLogs} />
          </div>
        </section>
      )}

      {/* Exercise selector */}
      <section>
        <p className="text-xs text-[#888888] uppercase tracking-wider mb-3">Exercise Progress</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {exercises?.map(ex => (
            <button
              key={ex.id}
              onClick={() => setSelectedExerciseId(ex.id === selectedExerciseId ? null : ex.id!)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                selectedExerciseId === ex.id
                  ? 'bg-[#f97316] text-white border-[#f97316]'
                  : 'bg-[#1a1a1a] text-[#888888] border-[#2a2a2a]'
              }`}
            >
              {ex.name}
            </button>
          ))}
        </div>

        {selectedExerciseId && (
          <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4">
            <ExerciseChart exerciseId={selectedExerciseId} />
          </div>
        )}
      </section>
    </div>
  )
}
