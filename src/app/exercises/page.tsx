'use client'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { ChevronRight, Dumbbell, Plus } from 'lucide-react'

export default function ExercisesPage() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray(), [])

  if (!exercises) return null

  return (
    <div className="py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Exercises</h1>
        <Link
          href="/exercises/new"
          className="flex items-center gap-1 text-[#f97316] text-sm font-medium"
        >
          <Plus size={18} />
          Add
        </Link>
      </div>

      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] divide-y divide-[#2a2a2a] overflow-hidden">
        {exercises.map(ex => (
          <Link key={ex.id} href={`/exercises/${ex.id}`} className="px-4 py-3 flex items-center gap-3">
            <Dumbbell size={16} className="text-[#888888] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{ex.name}</p>
              <p className="text-xs text-[#888888] mt-0.5 capitalize">
                {ex.equipmentType}
                {ex.weightDisplay !== 'none' && ` · +${ex.incrementKg} kg/session`}
                {` · ${ex.restSeconds}s rest`}
              </p>
            </div>
            <ChevronRight size={16} className="text-[#444444] shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
