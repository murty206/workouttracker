'use client'
import { create } from 'zustand'

interface WorkoutStore {
  sessionId: number | null
  restTimerStartMs: number | null
  restTimerDurationMs: number
  notificationPermissionAsked: boolean
  prExerciseId: number | null

  setSessionId: (id: number | null) => void
  startTimer: (seconds: number) => void
  stopTimer: () => void
  setNotificationPermissionAsked: (asked: boolean) => void
  flashPR: (exerciseId: number) => void
  clearPR: () => void
}

export const useWorkoutStore = create<WorkoutStore>((set) => ({
  sessionId: null,
  restTimerStartMs: null,
  restTimerDurationMs: 0,
  notificationPermissionAsked: false,
  prExerciseId: null,

  setSessionId: (id) => set({ sessionId: id }),

  startTimer: (seconds) => set({
    restTimerStartMs: Date.now(),
    restTimerDurationMs: Math.max(0, seconds) * 1000,
  }),

  stopTimer: () => set({ restTimerStartMs: null, restTimerDurationMs: 0 }),

  setNotificationPermissionAsked: (asked) => set({ notificationPermissionAsked: asked }),

  flashPR: (exerciseId) => {
    set({ prExerciseId: exerciseId })
    setTimeout(() => set({ prExerciseId: null }), 3000)
  },

  clearPR: () => set({ prExerciseId: null }),
}))
