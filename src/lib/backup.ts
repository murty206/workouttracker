import { db } from '@/lib/db'

export async function exportAll(): Promise<void> {
  const [
    exercises, programs, programWeeks, workoutTemplates,
    templateExercises, sessions, setLogs, personalRecords,
    bodyweightLogs, userPrefs,
  ] = await Promise.all([
    db.exercises.toArray(),
    db.programs.toArray(),
    db.programWeeks.toArray(),
    db.workoutTemplates.toArray(),
    db.templateExercises.toArray(),
    db.sessions.toArray(),
    db.setLogs.toArray(),
    db.personalRecords.toArray(),
    db.bodyweightLogs.toArray(),
    db.userPrefs.toArray(),
  ])

  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    exercises, programs, programWeeks, workoutTemplates,
    templateExercises, sessions, setLogs, personalRecords,
    bodyweightLogs, userPrefs,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const date = new Date().toISOString().split('T')[0]
  const a = document.createElement('a')
  a.href = url
  a.download = `workouttracker-backup-${date}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json)

  await db.transaction('rw', [
    db.exercises, db.programs, db.programWeeks, db.workoutTemplates,
    db.templateExercises, db.sessions, db.setLogs, db.personalRecords,
    db.bodyweightLogs, db.userPrefs,
  ], async () => {
    await db.exercises.clear()
    await db.programs.clear()
    await db.programWeeks.clear()
    await db.workoutTemplates.clear()
    await db.templateExercises.clear()
    await db.sessions.clear()
    await db.setLogs.clear()
    await db.personalRecords.clear()
    await db.bodyweightLogs.clear()
    await db.userPrefs.clear()

    if (data.exercises?.length)        await db.exercises.bulkAdd(data.exercises)
    if (data.programs?.length)         await db.programs.bulkAdd(data.programs)
    if (data.programWeeks?.length)     await db.programWeeks.bulkAdd(data.programWeeks)
    if (data.workoutTemplates?.length) await db.workoutTemplates.bulkAdd(data.workoutTemplates)
    if (data.templateExercises?.length)await db.templateExercises.bulkAdd(data.templateExercises)
    if (data.sessions?.length)         await db.sessions.bulkAdd(data.sessions)
    if (data.setLogs?.length)          await db.setLogs.bulkAdd(data.setLogs)
    if (data.personalRecords?.length)  await db.personalRecords.bulkAdd(data.personalRecords)
    if (data.bodyweightLogs?.length)   await db.bodyweightLogs.bulkAdd(data.bodyweightLogs)
    if (data.userPrefs?.length)        await db.userPrefs.bulkAdd(data.userPrefs)
  })
}
