'use client'
import { useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import type { WorkoutLabel, Exercise, TemplateExercise } from '@/types'
import { ChevronLeft, ChevronUp, ChevronDown, RefreshCw, Trash2, Plus, X } from 'lucide-react'
import { formatWeight } from '@/lib/weight'

type Row = { te: TemplateExercise; exercise: Exercise }

async function getAllTemplateIds(programId: number, label: WorkoutLabel): Promise<number[]> {
  const weeks = await db.programWeeks.where('programId').equals(programId).toArray()
  const ids: number[] = []
  for (const week of weeks) {
    const tmpl = await db.workoutTemplates
      .where('programWeekId').equals(week.id!)
      .filter(t => t.label === label)
      .first()
    if (tmpl) ids.push(tmpl.id!)
  }
  return ids
}

export default function EditWorkoutPage() {
  const params = useParams()
  const router = useRouter()
  const label = (params.label as string).toUpperCase() as WorkoutLabel

  const [swappingExercise, setSwappingExercise] = useState<Exercise | null>(null)
  const [addingExercise, setAddingExercise] = useState(false)
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null)
  const [working, setWorking] = useState(false)

  const data = useLiveQuery(async () => {
    const program = await db.programs.where('isActive').equals(1).first()
    if (!program) return null
    const week1 = await db.programWeeks
      .where('[programId+weekNumber]').equals([program.id!, 1]).first()
    if (!week1) return null
    const template = await db.workoutTemplates
      .where('programWeekId').equals(week1.id!)
      .filter(t => t.label === label)
      .first()
    if (!template) return null
    const tes = await db.templateExercises
      .where('workoutTemplateId').equals(template.id!)
      .sortBy('orderInWorkout')
    const rows: Row[] = []
    for (const te of tes) {
      const exercise = await db.exercises.get(te.exerciseId)
      if (exercise) rows.push({ te, exercise })
    }
    return { program, rows }
  }, [label])

  const allExercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  const swapAlternatives = useLiveQuery(async () => {
    if (!swappingExercise) return []
    const ids = swappingExercise.alternativeExerciseIds
    if (!ids.length) return []
    return db.exercises.where('id').anyOf(ids).toArray()
  }, [swappingExercise])

  const handleSwap = useCallback(async (oldExercise: Exercise, newExercise: Exercise) => {
    if (!data) return
    setWorking(true)
    try {
      const templateIds = await getAllTemplateIds(data.program.id!, label)
      const isBw = newExercise.equipmentType === 'bodyweight'
      const lastLog = isBw ? undefined : await db.setLogs
        .where('exerciseId').equals(newExercise.id!)
        .filter(l => !l.isWarmup && l.weightKg !== null)
        .last()
      for (const templateId of templateIds) {
        const te = await db.templateExercises
          .where('workoutTemplateId').equals(templateId)
          .filter(t => t.exerciseId === oldExercise.id)
          .first()
        if (te) {
          await db.templateExercises.update(te.id!, {
            exerciseId: newExercise.id!,
            plannedWeightKg: isBw ? null : (lastLog?.weightKg ?? null),
            warmupWeights: [],
            ...(isBw ? { plannedReps: 'max' } : {}),
          })
        }
      }
    } finally {
      setWorking(false)
      setSwappingExercise(null)
    }
  }, [data, label])

  const handleRemove = useCallback(async (exerciseId: number) => {
    if (!data) return
    setWorking(true)
    try {
      const templateIds = await getAllTemplateIds(data.program.id!, label)
      for (const templateId of templateIds) {
        await db.templateExercises
          .where('workoutTemplateId').equals(templateId)
          .filter(t => t.exerciseId === exerciseId)
          .delete()
      }
    } finally {
      setWorking(false)
      setConfirmRemoveId(null)
    }
  }, [data, label])

  const handleAdd = useCallback(async (exercise: Exercise) => {
    if (!data) return
    setWorking(true)
    try {
      const templateIds = await getAllTemplateIds(data.program.id!, label)
      const currentCount = data.rows.length
      const isBw = exercise.equipmentType === 'bodyweight'
      const lastLog = isBw ? undefined : await db.setLogs
        .where('exerciseId').equals(exercise.id!)
        .filter(l => !l.isWarmup && l.weightKg !== null)
        .last()
      for (const templateId of templateIds) {
        await db.templateExercises.add({
          workoutTemplateId: templateId,
          exerciseId: exercise.id!,
          orderInWorkout: currentCount,
          plannedSets: 3,
          plannedReps: isBw ? 'max' : '10',
          plannedWeightKg: isBw ? null : (lastLog?.weightKg ?? null),
          warmupWeights: [],
        })
      }
    } finally {
      setWorking(false)
      setAddingExercise(false)
    }
  }, [data, label])

  const handleMove = useCallback(async (index: number, direction: -1 | 1) => {
    if (!data) return
    const rows = data.rows
    const swapIndex = index + direction
    if (swapIndex < 0 || swapIndex >= rows.length) return
    setWorking(true)
    try {
      const templateIds = await getAllTemplateIds(data.program.id!, label)
      const exA = rows[index].exercise.id!
      const exB = rows[swapIndex].exercise.id!
      const orderA = rows[index].te.orderInWorkout
      const orderB = rows[swapIndex].te.orderInWorkout
      for (const templateId of templateIds) {
        const teA = await db.templateExercises
          .where('workoutTemplateId').equals(templateId)
          .filter(t => t.exerciseId === exA).first()
        const teB = await db.templateExercises
          .where('workoutTemplateId').equals(templateId)
          .filter(t => t.exerciseId === exB).first()
        if (teA) await db.templateExercises.update(teA.id!, { orderInWorkout: orderB })
        if (teB) await db.templateExercises.update(teB.id!, { orderInWorkout: orderA })
      }
    } finally {
      setWorking(false)
    }
  }, [data, label])

  if (!data) return null

  // — Swap picker —
  if (swappingExercise) {
    return (
      <div className="py-6 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSwappingExercise(null)} className="text-[#888888]">
            <X size={24} />
          </button>
          <div>
            <p className="text-xs text-[#888888]">Swapping</p>
            <h1 className="text-xl font-bold">{swappingExercise.name}</h1>
          </div>
        </div>

        {!swapAlternatives?.length ? (
          <p className="text-[#888888] text-sm text-center py-8">
            No alternatives set for this exercise.{' '}
            <span className="text-[#f97316]">Edit the exercise to add some.</span>
          </p>
        ) : (
          <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] divide-y divide-[#2a2a2a] overflow-hidden">
            {swapAlternatives.map(alt => (
              <button
                key={alt.id}
                onClick={() => handleSwap(swappingExercise, alt)}
                disabled={working}
                className="w-full px-4 py-4 flex items-center justify-between text-left"
              >
                <div>
                  <p className="text-sm font-medium">{alt.name}</p>
                  <p className="text-xs text-[#888888] mt-0.5 capitalize">{alt.equipmentType}</p>
                </div>
                <RefreshCw size={16} className="text-[#f97316]" />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // — Add exercise picker —
  if (addingExercise) {
    const existingIds = new Set(data.rows.map(r => r.exercise.id!))
    const available = allExercises?.filter(e => !existingIds.has(e.id!)) ?? []
    return (
      <div className="py-6 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setAddingExercise(false)} className="text-[#888888]">
            <X size={24} />
          </button>
          <h1 className="text-xl font-bold">Add Exercise</h1>
        </div>
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] divide-y divide-[#2a2a2a] overflow-hidden">
          {available.map(ex => (
            <button
              key={ex.id}
              onClick={() => handleAdd(ex)}
              disabled={working}
              className="w-full px-4 py-4 flex items-center justify-between text-left"
            >
              <div>
                <p className="text-sm font-medium">{ex.name}</p>
                <p className="text-xs text-[#888888] mt-0.5 capitalize">{ex.equipmentType}</p>
              </div>
              <Plus size={16} className="text-[#f97316]" />
            </button>
          ))}
        </div>
      </div>
    )
  }

  // — Main editor —
  return (
    <div className="py-6 space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-[#888888]">
          <ChevronLeft size={24} />
        </button>
        <div>
          <p className="text-xs text-[#888888]">Edit workout</p>
          <h1 className="text-xl font-bold">Workout {label}</h1>
        </div>
      </div>
      <p className="text-xs text-[#888888]">Changes apply to all weeks in your program.</p>

      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] divide-y divide-[#2a2a2a] overflow-hidden">
        {data.rows.map(({ te, exercise }, index) => (
          <div key={exercise.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              {/* Reorder */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0 || working}
                  className="text-[#444444] disabled:opacity-20 p-0.5"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => handleMove(index, 1)}
                  disabled={index === data.rows.length - 1 || working}
                  className="text-[#444444] disabled:opacity-20 p-0.5"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{exercise.name}</p>
                <p className="text-xs text-[#888888] mt-0.5">
                  {te.plannedSets} × {te.plannedReps}
                  {te.plannedWeightKg !== null && ` · ${formatWeight(te.plannedWeightKg, exercise.equipmentType)}`}
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSwappingExercise(exercise)}
                  disabled={working}
                  className="text-[#888888] p-1.5"
                >
                  <RefreshCw size={15} />
                </button>
                {confirmRemoveId === exercise.id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleRemove(exercise.id!)}
                      disabled={working}
                      className="text-xs bg-[#ef4444] text-white px-2 py-1 rounded-lg"
                    >
                      Remove
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      className="text-xs bg-[#242424] text-[#888888] px-2 py-1 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(exercise.id!)}
                    disabled={working}
                    className="text-[#888888] p-1.5"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setAddingExercise(true)}
        className="w-full flex items-center justify-center gap-2 text-[#f97316] text-sm font-medium border border-[#f97316] rounded-2xl py-3"
      >
        <Plus size={16} />
        Add exercise
      </button>
    </div>
  )
}
