'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { useWorkoutStore } from '@/store/workoutStore'

// Pure helper so the time math is unit-testable in isolation.
export function remainingSeconds(nowMs: number, startMs: number | null, durationMs: number): number {
  if (startMs === null) return 0
  return Math.max(0, Math.ceil((startMs + durationMs - nowMs) / 1000))
}

// Minimal subset of the Wake Lock API we actually use. Lets us type the
// promise return + release method without pulling in a full DOM lib
// declaration that varies between TS targets.
interface WakeLockSentinelLike {
  release: () => Promise<void>
}

export function RestTimer() {
  const startMs = useWorkoutStore(s => s.restTimerStartMs)
  const durationMs = useWorkoutStore(s => s.restTimerDurationMs)
  const stop = useWorkoutStore(s => s.stopTimer)
  const startTimer = useWorkoutStore(s => s.startTimer)
  const notifAsked = useWorkoutStore(s => s.notificationPermissionAsked)
  const setNotifAsked = useWorkoutStore(s => s.setNotificationPermissionAsked)

  const [now, setNow] = useState(() => Date.now())
  const notifiedRef = useRef(false)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)

  // Reset notified flag whenever a new timer starts.
  useEffect(() => {
    notifiedRef.current = false
  }, [startMs])

  // UI tick — only re-renders, real time comes from Date.now() so the
  // timer stays accurate even if the tab was backgrounded/throttled.
  useEffect(() => {
    if (startMs === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [startMs])

  // Ask for Notification permission once per session, the first time a
  // timer starts. Browsers require this to happen in a user-gesture path
  // and they ignore subsequent prompts after the user has chosen.
  useEffect(() => {
    if (startMs === null) return
    if (notifAsked) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') {
      setNotifAsked(true)
      return
    }
    Notification.requestPermission().finally(() => setNotifAsked(true))
  }, [startMs, notifAsked, setNotifAsked])

  // Hold a screen Wake Lock while the timer is running. On Android Firefox
  // (and most mobile browsers) the Notification + vibrate fallbacks fire
  // unreliably once the tab is backgrounded or the screen times out, so
  // keeping the screen on during rest is the most dependable way for the
  // user to actually notice the countdown ending.
  useEffect(() => {
    if (startMs === null) return
    if (typeof navigator === 'undefined') return
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    if (!nav.wakeLock) return

    let cancelled = false

    async function acquire() {
      try {
        const lock = await nav.wakeLock!.request('screen')
        if (cancelled) {
          await lock.release().catch(() => {})
          return
        }
        wakeLockRef.current = lock
      } catch {
        // Permission denied / not supported in this state — silent fallback.
      }
    }

    // Some platforms drop the wake lock when the tab is hidden and don't
    // auto-reacquire on return. Re-request on visibility change.
    function onVisibility() {
      if (document.visibilityState === 'visible' && wakeLockRef.current === null) {
        acquire()
      }
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      const lock = wakeLockRef.current
      wakeLockRef.current = null
      lock?.release().catch(() => {})
    }
  }, [startMs])

  const remaining = remainingSeconds(now, startMs, durationMs)
  const totalSec = Math.ceil(durationMs / 1000)
  const pct = totalSec > 0 ? (remaining / totalSec) * 100 : 0

  // Fire vibration + notification exactly once when the timer hits 0.
  useEffect(() => {
    if (startMs === null) return
    if (remaining > 0) return
    if (notifiedRef.current) return
    notifiedRef.current = true
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200, 100, 400])
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Rest done', { body: 'Time to lift' }) } catch { /* ignore */ }
    }
  }, [remaining, startMs])

  if (startMs === null || remaining === 0) return null

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const display = `${mins}:${String(secs).padStart(2, '0')}`

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 max-w-lg mx-auto px-4">
      <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-[#888888]">Rest Timer</span>
          <button onClick={stop} className="text-[#888888]"><X size={18} /></button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden mb-3">
          <div
            className="h-full bg-[#f97316] rounded-full transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => startTimer(Math.max(15, remaining - 15))}
            className="flex items-center gap-1 text-sm text-[#888888] bg-[#242424] px-3 py-1.5 rounded-lg"
          >
            <Minus size={14} /> 15s
          </button>

          <span className="text-4xl font-bold tabular-nums text-[#f97316]">{display}</span>

          <button
            onClick={() => startTimer(remaining + 30)}
            className="flex items-center gap-1 text-sm text-[#888888] bg-[#242424] px-3 py-1.5 rounded-lg"
          >
            <Plus size={14} /> 30s
          </button>
        </div>
      </div>
    </div>
  )
}
