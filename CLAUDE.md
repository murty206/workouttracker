# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at localhost:3000
npm run build     # Production build (also runs TypeScript check)
npm run lint      # ESLint
npx tsx scripts/parse-xlsx.ts  # Re-generate seed data from the spreadsheet
```

## Architecture

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · Dexie.js (IndexedDB) · Zustand · Recharts

**No backend.** All data lives in the browser's IndexedDB via Dexie. No auth, no server, no API routes. Deploy as a Next.js app on Vercel.

### Key directories

```
src/
  app/          # Next.js routes: /today, /workout/[sessionId], /history, /progress, /exercises, /settings
  components/   # layout/, workout/, today/, progress/, ui/
  lib/          # db.ts, seed.ts, seed-data.ts, program.ts, progression.ts, pr.ts, weight.ts
  store/        # workoutStore.ts — Zustand (rest timer + PR flash only, NOT data)
  types/        # index.ts — all TypeScript interfaces
  hooks/        # (future hooks)
scripts/
  parse-xlsx.ts # One-time script: reads spreadsheet → writes src/lib/seed-data.ts
```

### Data flow

1. On first load, `Seeder` component calls `seedIfEmpty()` which populates IndexedDB from `seed-data.ts`
2. `useLiveQuery` (dexie-react-hooks) drives all reactive UI — no separate state management for data
3. Zustand (`workoutStore.ts`) holds only ephemeral session state: rest timer and PR badge flash
4. After a session is completed, `applyProgression()` auto-adjusts next session's template weights

### Weight convention

All weights stored and displayed **per side** (one dumbbell / one side of barbell). Only machines (`Lat Pulldown`) use total weight. `src/lib/weight.ts` has `formatWeight()` and `weightLabel()` used everywhere.

### Progressive overload logic (`src/lib/progression.ts`)

- Hit all reps at upper rep range → `INCREASE` by `exercise.incrementKg`
- Below 80% of lower rep range total → `DECREASE` by `exercise.incrementKg`
- Otherwise → `SAME`
- Barbell: +2.5 kg/side · Dumbbell: +1.25 kg/side · Machine: +2.5 kg total

### Program structure

- 12 weeks × 3 workouts (A/B/C) + 1 deload week = 39 sessions
- Week advances every 3 completed sessions (session-based, not calendar)
- Missed sessions: app resumes from last uncompleted session in A→B→C cycle
- On program completion: `restartProgram()` creates new program with final logged weights as Week 1 starting weights

### Seeding the spreadsheet

`scripts/parse-xlsx.ts` reads `Antrenman Programı.xlsx` and writes `src/lib/seed-data.ts`. Run it only when the spreadsheet changes. The output is committed and imported at runtime.
