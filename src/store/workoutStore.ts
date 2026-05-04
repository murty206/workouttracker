'use client'
import { create } from 'zustand'

interface WorkoutStore {
  sessionId: number | null
  restTimerSeconds: number
  restTimerTotal: number
  prExerciseId: number | null

  setSessionId: (id: number | null) => void
  startTimer: (seconds: number) => void
  tickTimer: () => void
  stopTimer: () => void
  flashPR: (exerciseId: number) => void
  clearPR: () => void
}

export const useWorkoutStore = create<WorkoutStore>((set) => ({
  sessionId: null,
  restTimerSeconds: 0,
  restTimerTotal: 0,
  prExerciseId: null,

  setSessionId: (id) => set({ sessionId: id }),

  startTimer: (seconds) => set({ restTimerSeconds: seconds, restTimerTotal: seconds }),

  tickTimer: () =>
    set((s) => ({ restTimerSeconds: Math.max(0, s.restTimerSeconds - 1) })),

  stopTimer: () => set({ restTimerSeconds: 0, restTimerTotal: 0 }),

  flashPR: (exerciseId) => {
    set({ prExerciseId: exerciseId })
    setTimeout(() => set({ prExerciseId: null }), 3000)
  },

  clearPR: () => set({ prExerciseId: null }),
}))
