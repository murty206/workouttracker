'use client'
import { useState } from 'react'
import { Plus, Minus, Check } from 'lucide-react'
import { weightLabel } from '@/lib/weight'
import type { Exercise } from '@/types'

interface Props {
  setNumber: number
  exercise: Exercise
  defaultWeight: number | null
  defaultReps: number
  onLog: (weight: number | null, reps: number) => void
}

export function SetRow({ setNumber, exercise, defaultWeight, defaultReps, onLog }: Props) {
  const isBodyweight = exercise.equipmentType === 'bodyweight'
  const inc = exercise.incrementKg || 1.25

  const [weight, setWeight] = useState<string>(defaultWeight?.toString() ?? '')
  const [reps, setReps] = useState<string>(defaultReps.toString())

  function adjustWeight(delta: number) {
    const current = parseFloat(weight) || 0
    setWeight(String(Math.max(0, Math.round((current + delta) * 100) / 100)))
  }

  function adjustReps(delta: number) {
    setReps(String(Math.max(1, (parseInt(reps) || 0) + delta)))
  }

  function handleLog() {
    const w = isBodyweight ? null : parseFloat(weight)
    const r = parseInt(reps)
    if (isNaN(r) || r <= 0) return
    if (!isBodyweight && (isNaN(w!) || w! < 0)) return
    onLog(w, r)
  }

  return (
    <div className="px-3 py-3 flex items-center gap-2 bg-[#242424]">
      <span className="w-6 text-center text-[#888888] text-xs shrink-0">{setNumber}</span>

      {/* Weight input */}
      {!isBodyweight && (
        <div className="flex items-center gap-1 flex-1">
          <button
            onClick={() => adjustWeight(-inc)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2a2a2a] text-[#888888] active:scale-90 transition-transform"
          >
            <Minus size={14} />
          </button>
          <div className="flex-1 relative">
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              onFocus={e => e.target.select()}
              className="w-full bg-[#1a1a1a] text-[#f5f5f5] text-center text-base font-semibold rounded-lg px-2 py-1.5 border border-[#2a2a2a] focus:border-[#f97316] outline-none tabular-nums"
            />
          </div>
          <button
            onClick={() => adjustWeight(inc)}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2a2a2a] text-[#888888] active:scale-90 transition-transform"
          >
            <Plus size={14} />
          </button>
          <span className="text-[#888888] text-xs w-10 shrink-0">{weightLabel(exercise.equipmentType)}</span>
        </div>
      )}

      {/* Reps input */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => adjustReps(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2a2a2a] text-[#888888] active:scale-90 transition-transform"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          inputMode="numeric"
          value={reps}
          onChange={e => setReps(e.target.value)}
          onFocus={e => e.target.select()}
          className="w-12 bg-[#1a1a1a] text-[#f5f5f5] text-center text-base font-semibold rounded-lg px-1 py-1.5 border border-[#2a2a2a] focus:border-[#f97316] outline-none tabular-nums"
        />
        <button
          onClick={() => adjustReps(1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-[#2a2a2a] text-[#888888] active:scale-90 transition-transform"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Log button */}
      <button
        onClick={handleLog}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#f97316] text-white active:scale-90 transition-transform shrink-0"
      >
        <Check size={18} />
      </button>
    </div>
  )
}
