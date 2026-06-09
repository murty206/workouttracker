'use client'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { db } from '@/lib/db'
import type { TemplateExercise, Exercise } from '@/types'

type WorkoutLabel = 'A' | 'B' | 'C'

interface WorkoutBlueprint {
  label: WorkoutLabel
  exercises: { te: TemplateExercise; exercise: Exercise }[]
}

export default function ProgramOverviewPage() {
  const data = useLiveQuery(async () => {
    const program = await db.programs.where('isActive').equals(1).first()
    if (!program) return null

    // Week 1 templates are the canonical structure reference. Edit Workouts
    // propagates exercise changes to every week of the active program, so
    // these reflect the user's current setup, not the original seed.
    const firstWeek = await db.programWeeks
      .where('programId').equals(program.id!)
      .filter(w => w.weekNumber === 1)
      .first()
    if (!firstWeek) return null

    const templates = await db.workoutTemplates
      .where('programWeekId').equals(firstWeek.id!)
      .sortBy('orderInWeek')

    const blueprints: WorkoutBlueprint[] = []
    for (const tmpl of templates) {
      const tes = await db.templateExercises
        .where('workoutTemplateId').equals(tmpl.id!)
        .sortBy('orderInWorkout')
      const exercises = await Promise.all(
        tes.map(async te => ({
          te,
          exercise: (await db.exercises.get(te.exerciseId))!,
        })),
      )
      blueprints.push({ label: tmpl.label as WorkoutLabel, exercises })
    }

    return { program, blueprints }
  }, [])

  if (!data) {
    return (
      <div className="py-6 text-center text-sm text-[#888888]">
        Loading program…
      </div>
    )
  }

  const { program, blueprints } = data
  const deloadWeek = program.totalWeeks + 1

  return (
    <div className="py-6 space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="text-[#888888]">
          <ChevronLeft size={24} />
        </Link>
        <h1 className="text-xl font-bold">Program Overview</h1>
      </div>

      {/* Structure */}
      <section className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 space-y-2">
        <p className="text-xs text-[#888888] uppercase tracking-wider">Structure</p>
        <ul className="text-sm space-y-1 list-disc list-inside marker:text-[#444444]">
          <li>{program.totalWeeks} weeks of training + 1 deload week (W{deloadWeek})</li>
          <li>3 workouts per week — A, B, C — rotated in order</li>
          <li>Cardio (Incline Walk) appended to every session</li>
        </ul>
      </section>

      {/* Weekly split */}
      <section className="space-y-2">
        <p className="text-xs text-[#888888] uppercase tracking-wider px-1">Weekly Split</p>
        {blueprints.map(b => (
          <WorkoutCard key={b.label} blueprint={b} />
        ))}
      </section>

      {/* Rep schemes glossary */}
      <section className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 space-y-2">
        <p className="text-xs text-[#888888] uppercase tracking-wider">Rep Schemes</p>
        <ul className="text-sm space-y-2">
          <Glossary term="N">
            Fixed target. All sets aim for exactly N reps. e.g. <code>3×8</code> = 3 sets of 8.
          </Glossary>
          <Glossary term="N-M">
            Range. Hit the lower bound to hold; hit the upper to bump. e.g. <code>3×8-12</code>.
          </Glossary>
          <Glossary term="N+">
            AMRAP — last set is &quot;as many reps as possible&quot; from N. e.g. <code>4×5+</code> = 3 sets of 5 then a final all-out set.
          </Glossary>
          <Glossary term="max">
            Bodyweight or set-to-failure. Rep count drives the Rep PR; no weight progression.
          </Glossary>
        </ul>
      </section>

      {/* Progression rules */}
      <section className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] p-4 space-y-3">
        <p className="text-xs text-[#888888] uppercase tracking-wider">Progression</p>
        <Rule title="Weighted lifts — median basis">
          The median of the weights you actually lifted (not the planned weight) drives the next prescription. Hit the upper rep target on every set → +1 increment. Two or more sets above the upper → +2 increments. Worst set below the lower → −1 increment.
        </Rule>
        <Rule title="Dumbbell triple-confirm">
          Small dumbbells need 3 consecutive INCREASE sessions before bumping. Reason: 2.5 → 5 kg is a 100 % jump and you almost certainly aren&apos;t ready for it after one good session.
        </Rule>
        <Rule title="AMRAP overshoot bonus">
          On <code>N+</code> schemes, the last set decides. Last set ≥ 1.5 × N → INCREASE. Last set ≥ 2 × N → INCREASE_2 (capped on dumbbells per the rule above).
        </Rule>
        <Rule title="Cardio weekly rotation">
          Even weeks bump incline by +0.5 %, odd weeks bump speed by +0.25 km/h. When one axis is capped (12 % incline / 5.5 km/h), the bump falls through to the other.
        </Rule>
        <Rule title="Deload">
          Week {deloadWeek} = 50 % of W{program.totalWeeks} lifted median, floored to the nearest equipment step. Recovery week — not maintenance.
        </Rule>
      </section>

      {/* Tools */}
      <section className="space-y-2">
        <p className="text-xs text-[#888888] uppercase tracking-wider px-1">Tools</p>
        <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden divide-y divide-[#2a2a2a]">
          <Link href="/program/edit/A" className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Edit Workouts</p>
              <p className="text-xs text-[#888888] mt-0.5">Swap, add, remove, or reorder exercises in A / B / C</p>
            </div>
            <ChevronRight size={16} className="text-[#444444]" />
          </Link>
          <Link href="/exercises" className="px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Exercises</p>
              <p className="text-xs text-[#888888] mt-0.5">Library, alternatives, per-exercise rest and notes</p>
            </div>
            <ChevronRight size={16} className="text-[#444444]" />
          </Link>
        </div>
      </section>
    </div>
  )
}

function WorkoutCard({ blueprint }: { blueprint: WorkoutBlueprint }) {
  return (
    <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2a2a2a]">
        <p className="text-sm font-bold">Workout {blueprint.label}</p>
      </div>
      <div className="divide-y divide-[#2a2a2a]/40">
        {blueprint.exercises.map(({ te, exercise }) => (
          <div key={te.id} className="px-4 py-2 flex items-center justify-between gap-3">
            <p className="text-sm truncate">{exercise.name}</p>
            <p className="text-xs text-[#888888] tabular-nums shrink-0">
              {exercise.equipmentType === 'cardio'
                ? `${te.cardioDurationMin ?? '—'} min`
                : `${te.plannedSets} × ${te.plannedReps}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Glossary({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <code className="text-[#f97316] text-xs font-mono shrink-0 mt-0.5 min-w-[3rem]">{term}</code>
      <span className="text-xs text-[#a8a8a8]">{children}</span>
    </li>
  )
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-[#888888] mt-0.5 leading-relaxed">{children}</p>
    </div>
  )
}
