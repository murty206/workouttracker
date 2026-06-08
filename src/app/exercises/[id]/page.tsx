'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { EquipmentType, WeightDisplay } from '@/types'
import { ChevronLeft, Trash2 } from 'lucide-react'

const weightDisplayFor: Record<EquipmentType, WeightDisplay> = {
  barbell: 'per-side',
  dumbbell: 'per-side',
  machine: 'total',
  bodyweight: 'none',
  cardio: 'none',
}

export default function ExerciseEditPage() {
  const params = useParams()
  const router = useRouter()
  const isNew = params.id === 'new'
  const exerciseId = isNew ? null : Number(params.id)

  const exercise = useLiveQuery(
    () => (exerciseId ? db.exercises.get(exerciseId) : undefined),
    [exerciseId]
  )
  const allExercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  const [name, setName] = useState('')
  const [equipmentType, setEquipmentType] = useState<EquipmentType>('barbell')
  const [incrementKg, setIncrementKg] = useState(2.5)
  const [restSeconds, setRestSeconds] = useState(90)
  const [notes, setNotes] = useState('')
  const [altIds, setAltIds] = useState<number[]>([])
  const [requiresSetupNote, setRequiresSetupNote] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized && exercise) {
      setName(exercise.name)
      setEquipmentType(exercise.equipmentType)
      setIncrementKg(exercise.incrementKg)
      setRestSeconds(exercise.restSeconds)
      setNotes(exercise.notes ?? '')
      setAltIds(exercise.alternativeExerciseIds)
      setRequiresSetupNote(exercise.requiresSetupNote ?? false)
      setInitialized(true)
    }
  }, [exercise, initialized])

  function handleEquipmentChange(t: EquipmentType) {
    setEquipmentType(t)
    if (t === 'bodyweight') { setIncrementKg(0); setRestSeconds(60) }
    else if (t === 'barbell') { setIncrementKg(2.5); setRestSeconds(90) }
    else { setIncrementKg(1.25); setRestSeconds(60) }
  }

  function toggleAlt(id: number) {
    setAltIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      const data = {
        name: name.trim(),
        equipmentType,
        weightDisplay: weightDisplayFor[equipmentType],
        incrementKg: equipmentType === 'bodyweight' ? 0 : incrementKg,
        restSeconds,
        alternativeExerciseIds: altIds,
        notes: notes.trim() || undefined,
        requiresSetupNote,
      }
      if (isNew) {
        await db.exercises.add({ ...data, category: 'strength', primaryMuscle: 'general', isCustom: true })
      } else {
        await db.exercises.update(exerciseId!, data)
      }
      router.back()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await db.exercises.delete(exerciseId!)
    router.back()
  }

  if (!isNew && exerciseId && !exercise && initialized === false) return null

  const otherExercises = allExercises?.filter(e => e.id !== exerciseId) ?? []

  return (
    <div className="py-6 space-y-6 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-[#888888]">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold">{isNew ? 'New Exercise' : 'Edit Exercise'}</h1>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3">
          <label className="text-xs text-[#888888] uppercase tracking-wider">Name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Exercise name"
            className="w-full bg-transparent text-sm mt-1 outline-none"
          />
        </div>

        {/* Equipment type */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3">
          <p className="text-xs text-[#888888] uppercase tracking-wider mb-2">Equipment</p>
          <div className="grid grid-cols-2 gap-2">
            {(['barbell', 'dumbbell', 'machine', 'bodyweight'] as EquipmentType[]).map(t => (
              <button
                key={t}
                onClick={() => handleEquipmentChange(t)}
                className={`py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
                  equipmentType === t ? 'bg-[#f97316] text-white' : 'bg-[#242424] text-[#888888]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Increment + Rest */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] divide-y divide-[#2a2a2a]">
          {equipmentType !== 'bodyweight' && (
            <div className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Increment per session</p>
                <p className="text-xs text-[#888888] mt-0.5">
                  {equipmentType === 'machine' ? 'kg total' : 'kg/side'}
                </p>
              </div>
              <input
                type="number"
                step="0.25"
                min="0"
                value={incrementKg}
                onChange={e => setIncrementKg(Number(e.target.value))}
                className="w-16 bg-[#242424] text-sm text-right rounded-lg px-2 py-1 outline-none"
              />
            </div>
          )}
          <div className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Rest timer</p>
              <p className="text-xs text-[#888888] mt-0.5">seconds</p>
            </div>
            <input
              type="number"
              step="15"
              min="0"
              value={restSeconds}
              onChange={e => setRestSeconds(Number(e.target.value))}
              className="w-16 bg-[#242424] text-sm text-right rounded-lg px-2 py-1 outline-none"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3">
          <label className="text-xs text-[#888888] uppercase tracking-wider">Notes / Cues</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. elbows tucked, pause at bottom"
            rows={3}
            className="w-full bg-transparent text-sm mt-1 outline-none resize-none"
          />
        </div>

        {/* Setup note toggle */}
        <button
          onClick={() => setRequiresSetupNote(v => !v)}
          className="w-full bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] px-4 py-3 flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium">Setup note per session</p>
            <p className="text-xs text-[#888888] mt-0.5">e.g. bar height for inverted row</p>
          </div>
          <div className={`w-10 h-6 rounded-full relative transition-colors ${requiresSetupNote ? 'bg-[#f97316]' : 'bg-[#444444]'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${requiresSetupNote ? 'left-[18px]' : 'left-0.5'}`} />
          </div>
        </button>

        {/* Alternatives */}
        {otherExercises.length > 0 && (
          <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a2a2a]">
              <p className="text-xs text-[#888888] uppercase tracking-wider">Swap Alternatives</p>
              <p className="text-xs text-[#888888] mt-1">Shown when swapping this exercise in a workout</p>
            </div>
            <div className="divide-y divide-[#2a2a2a]">
              {otherExercises.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => toggleAlt(ex.id!)}
                  className="w-full px-4 py-3 flex items-center justify-between"
                >
                  <p className="text-sm">{ex.name}</p>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    altIds.includes(ex.id!)
                      ? 'bg-[#f97316] border-[#f97316]'
                      : 'border-[#444444]'
                  }`}>
                    {altIds.includes(ex.id!) && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="w-full bg-[#f97316] text-white font-semibold py-3 rounded-2xl text-sm disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {/* Delete (custom only) */}
        {!isNew && exercise?.isCustom && (
          !confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full flex items-center justify-center gap-2 text-[#ef4444] text-sm font-medium py-3"
            >
              <Trash2 size={16} />
              Delete exercise
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-center text-[#f5f5f5]">Delete this exercise?</p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 bg-[#ef4444] text-white font-semibold py-2.5 rounded-xl text-sm"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 bg-[#242424] text-[#888888] font-semibold py-2.5 rounded-xl text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
