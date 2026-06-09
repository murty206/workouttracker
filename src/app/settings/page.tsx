'use client'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { exportAll, importAll } from '@/lib/backup'
import { navyBodyFat, leanMass } from '@/lib/body'
import { AlertTriangle, Download, Upload, ChevronRight, MoreHorizontal, X } from 'lucide-react'
import Link from 'next/link'
import type { BodyweightLog } from '@/types'

async function saveRestDefault(key: string, value: number) {
  if (value > 0) await db.userPrefs.put({ key, value: String(value) })
}

export default function SettingsPage() {
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)
  const [pendingFile, setPendingFile] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [bwWeight, setBwWeight] = useState('')
  const [bwWaist, setBwWaist] = useState('')
  const [bwNeck, setBwNeck] = useState('')
  const [measureError, setMeasureError] = useState<string | null>(null)
  const [logMenu, setLogMenu] = useState<number | null>(null)
  const [editingLog, setEditingLog] = useState<number | null>(null)

  const gender = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('gender')
    return (pref?.value ?? 'male') as 'male' | 'female'
  }, [])

  const heightCm = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('height_cm')
    return pref ? Number(pref.value) : null
  }, [])

  const restBarbell = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('rest_barbell')
    return Number(pref?.value ?? 90)
  }, [])

  const restOther = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('rest_other')
    return Number(pref?.value ?? 60)
  }, [])

  const allLogs = useLiveQuery(async () => {
    const logs = await db.bodyweightLogs.orderBy('loggedAt').toArray()
    return logs.reverse()
  }, [])

  const lastMeasurement = allLogs?.[0]

  async function handleReset() {
    setResetting(true)
    await db.delete()
    window.location.href = '/'
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      setPendingFile(ev.target?.result as string)
      setImportConfirm(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!pendingFile) return
    setImporting(true)
    try {
      await importAll(pendingFile)
      window.location.href = '/'
    } finally {
      setImporting(false)
      setImportConfirm(false)
      setPendingFile(null)
    }
  }

  async function handleGenderChange(value: 'male' | 'female') {
    await db.userPrefs.put({ key: 'gender', value })
  }

  async function saveHeight(h: number) {
    if (h > 0 && h < 300) await db.userPrefs.put({ key: 'height_cm', value: String(h) })
  }

  const bfPreview = (() => {
    if (!gender || !heightCm) return null
    const w = parseFloat(bwWaist)
    const n = parseFloat(bwNeck)
    if (isNaN(w) || isNaN(n) || w <= 0 || n <= 0 || w <= n) return null
    try { return navyBodyFat(gender, heightCm, w, n) } catch { return null }
  })()

  async function handleLogMeasurement() {
    setMeasureError(null)
    const w = parseFloat(bwWeight)
    if (isNaN(w) || w <= 0) {
      setMeasureError('Enter a valid weight.')
      return
    }

    const waist = parseFloat(bwWaist)
    const neck = parseFloat(bwNeck)
    const hasCircumference = bwWaist !== '' || bwNeck !== ''

    if (hasCircumference) {
      if (isNaN(waist) || waist <= 0) { setMeasureError('Enter a valid waist measurement.'); return }
      if (isNaN(neck) || neck <= 0) { setMeasureError('Enter a valid neck measurement.'); return }
      if (waist <= neck) { setMeasureError('Waist must be larger than neck.'); return }
      if (!heightCm) { setMeasureError('Set your height in Profile to compute body fat.'); return }
    }

    const canBf = hasCircumference && heightCm && gender

    const entry: BodyweightLog = {
      weightKg: w,
      loggedAt: new Date().toISOString().split('T')[0],
    }

    if (canBf) {
      const bf = Math.round(navyBodyFat(gender!, heightCm!, waist, neck) * 10) / 10
      entry.waistCm = waist
      entry.neckCm = neck
      entry.bodyFatPct = bf
      entry.leanMassKg = Math.round(leanMass(w, bf) * 10) / 10
    }

    await db.bodyweightLogs.add(entry)
    setBwWeight('')
    setBwWaist('')
    setBwNeck('')
  }

  async function handleDeleteLog(id: number) {
    await db.bodyweightLogs.delete(id)
    setLogMenu(null)
  }

  async function handleEditLog(id: number, weight: string, waist: string, neck: string) {
    const w = parseFloat(weight)
    if (isNaN(w) || w <= 0) return

    const ws = parseFloat(waist)
    const nc = parseFloat(neck)
    const hasCircumference = waist !== '' && neck !== ''

    const update: Partial<BodyweightLog> = { weightKg: w }

    if (hasCircumference && !isNaN(ws) && !isNaN(nc) && ws > nc && heightCm && gender) {
      const bf = Math.round(navyBodyFat(gender, heightCm, ws, nc) * 10) / 10
      update.waistCm = ws
      update.neckCm = nc
      update.bodyFatPct = bf
      update.leanMassKg = Math.round(leanMass(w, bf) * 10) / 10
    } else {
      update.waistCm = undefined
      update.neckCm = undefined
      update.bodyFatPct = undefined
      update.leanMassKg = undefined
    }

    await db.bodyweightLogs.update(id, update)
    setEditingLog(null)
  }

  return (
    <div className="py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Program */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Program</p>
        </div>
        <Link href="/program" className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Program Overview</p>
            <p className="text-xs text-[#888888] mt-0.5">Weekly plan, status, and session history</p>
          </div>
          <ChevronRight size={16} className="text-[#444444]" />
        </Link>
      </div>

      {/* Profile */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Profile</p>
        </div>
        <div className="divide-y divide-[#2a2a2a]">
          <div className="px-4 py-4 flex items-center justify-between">
            <p className="text-sm font-medium">Gender</p>
            <div className="flex gap-2">
              {(['male', 'female'] as const).map(g => (
                <button
                  key={g}
                  onClick={() => handleGenderChange(g)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    gender === g
                      ? 'bg-[#f97316] text-white'
                      : 'bg-[#242424] text-[#888888]'
                  }`}
                >
                  {g === 'male' ? 'Male' : 'Female'}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <p className="text-sm font-medium">Height</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                defaultValue={heightCm ?? ''}
                key={heightCm ?? 'empty'}
                onBlur={e => saveHeight(parseInt(e.target.value))}
                onFocus={e => e.target.select()}
                placeholder="175"
                className="w-16 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#2a2a2a] outline-none focus:border-[#f97316]"
              />
              <span className="text-xs text-[#888888]">cm</span>
            </div>
          </div>
        </div>
      </div>

      {/* Log Measurements */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Log Measurements</p>
        </div>

        {lastMeasurement && (
          <div className="px-4 py-3 border-b border-[#2a2a2a]">
            <p className="text-xs text-[#888888]">
              Last logged:{' '}
              {new Date(lastMeasurement.loggedAt).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric',
              })}
            </p>
            <p className="text-sm mt-0.5 text-[#f5f5f5]">
              {lastMeasurement.weightKg} kg
              {lastMeasurement.bodyFatPct !== undefined && (
                <span className="text-[#888888]">
                  {' '}· {lastMeasurement.bodyFatPct.toFixed(1)}% fat · {lastMeasurement.leanMassKg?.toFixed(1)} kg lean
                </span>
              )}
            </p>
          </div>
        )}

        <div className="px-4 py-4 space-y-3">
          {/* Weight */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-xs text-[#888888] mb-1.5">Weight</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={bwWeight}
                  onChange={e => setBwWeight(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="78.5"
                  className="flex-1 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-3 py-2 border border-[#2a2a2a] outline-none focus:border-[#f97316]"
                />
                <span className="text-xs text-[#888888] w-5">kg</span>
              </div>
            </div>
          </div>

          {/* Waist + Neck */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[#888888] mb-1.5">Waist</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={bwWaist}
                  onChange={e => setBwWaist(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="85"
                  className="flex-1 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-2 border border-[#2a2a2a] outline-none focus:border-[#f97316]"
                />
                <span className="text-xs text-[#888888]">cm</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-[#888888] mb-1.5">Neck</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={bwNeck}
                  onChange={e => setBwNeck(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="38"
                  className="flex-1 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-2 border border-[#2a2a2a] outline-none focus:border-[#f97316]"
                />
                <span className="text-xs text-[#888888]">cm</span>
              </div>
            </div>
          </div>

          {bfPreview !== null && (
            <p className="text-xs text-[#22c55e]">
              Est. body fat: {bfPreview.toFixed(1)}% · lean mass: {leanMass(parseFloat(bwWeight) || 0, bfPreview).toFixed(1)} kg
            </p>
          )}
          {!heightCm && !bfPreview && (
            <p className="text-xs text-[#888888]">Set height above to compute body fat %</p>
          )}
          {measureError && (
            <p className="text-xs text-[#ef4444]">{measureError}</p>
          )}

          <button
            onClick={handleLogMeasurement}
            disabled={!bwWeight || parseFloat(bwWeight) <= 0}
            className="w-full bg-[#f97316] text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40"
          >
            Log
          </button>
        </div>

        {/* Past entries */}
        {allLogs && allLogs.length > 0 && (
          <div className="border-t border-[#2a2a2a]">
            <div className="divide-y divide-[#2a2a2a]/50">
              {allLogs.map(log => (
                <div key={log.id}>
                  {/* Action menu */}
                  {logMenu === log.id && (
                    <div className="px-4 py-2.5 bg-[#242424] flex items-center justify-between gap-2">
                      <p className="text-xs text-[#888888] flex-1 truncate">
                        {log.weightKg} kg
                        {log.bodyFatPct !== undefined ? ` · ${log.bodyFatPct.toFixed(1)}% fat` : ''}
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => { setEditingLog(log.id!); setLogMenu(null) }}
                          className="text-xs bg-[#f97316] text-white px-3 py-1 rounded-lg"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteLog(log.id!)}
                          className="text-xs bg-[#ef4444] text-white px-3 py-1 rounded-lg"
                        >
                          Delete
                        </button>
                        <button onClick={() => setLogMenu(null)} className="text-[#888888] px-1">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {editingLog === log.id ? (
                    <MeasurementEditRow
                      log={log}
                      onSave={(w, ws, nc) => handleEditLog(log.id!, w, ws, nc)}
                      onCancel={() => setEditingLog(null)}
                    />
                  ) : (
                    <div className="px-4 py-2.5 flex items-center gap-3 text-sm">
                      <span className="flex-1 text-[#888888] text-xs">
                        {new Date(log.loggedAt).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </span>
                      <span className="tabular-nums">{log.weightKg} kg</span>
                      {log.bodyFatPct !== undefined && (
                        <span className="tabular-nums text-[#888888] text-xs">{log.bodyFatPct.toFixed(1)}% fat</span>
                      )}
                      <button
                        onClick={() => setLogMenu(logMenu === log.id ? null : log.id!)}
                        className="text-[#888888] p-1 -mr-1"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rest Timer */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Rest Timer Defaults</p>
        </div>
        <div className="divide-y divide-[#2a2a2a]">
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Barbell / compounds</p>
              <p className="text-xs text-[#888888] mt-0.5">Bench, Squat, OHP, Row</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                defaultValue={restBarbell}
                key={restBarbell}
                onBlur={e => saveRestDefault('rest_barbell', parseInt(e.target.value))}
                className="w-16 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#2a2a2a] outline-none focus:border-[#f97316]"
              />
              <span className="text-xs text-[#888888]">sec</span>
            </div>
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Isolations / accessories</p>
              <p className="text-xs text-[#888888] mt-0.5">Dumbbells, machines, cables</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                defaultValue={restOther}
                key={restOther}
                onBlur={e => saveRestDefault('rest_other', parseInt(e.target.value))}
                className="w-16 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#2a2a2a] outline-none focus:border-[#f97316]"
              />
              <span className="text-xs text-[#888888]">sec</span>
            </div>
          </div>
        </div>
      </div>

      {/* Backup */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Backup</p>
        </div>
        <div className="divide-y divide-[#2a2a2a]">
          <button
            onClick={exportAll}
            className="w-full px-4 py-4 flex items-center gap-3 text-left"
          >
            <Download size={16} className="text-[#f97316] shrink-0" />
            <div>
              <p className="text-sm font-medium">Download backup</p>
              <p className="text-xs text-[#888888] mt-0.5">Save all your data as a JSON file</p>
            </div>
          </button>

          <div className="px-4 py-4">
            <input ref={fileRef} type="file" accept=".json" onChange={handleFileChange} className="hidden" />
            {!importConfirm ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-3 text-left w-full"
              >
                <Upload size={16} className="text-[#888888] shrink-0" />
                <div>
                  <p className="text-sm font-medium">Restore from backup</p>
                  <p className="text-xs text-[#888888] mt-0.5">Replaces all current data</p>
                </div>
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-[#f5f5f5]">This will overwrite all current data. Are you sure?</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex-1 bg-[#f97316] text-white font-semibold py-2.5 rounded-xl text-sm"
                  >
                    {importing ? 'Restoring…' : 'Yes, restore'}
                  </button>
                  <button
                    onClick={() => { setImportConfirm(false); setPendingFile(null) }}
                    className="flex-1 bg-[#242424] text-[#888888] font-semibold py-2.5 rounded-xl text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Danger Zone</p>
        </div>
        <div className="px-4 py-4">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="flex items-center gap-2 text-[#ef4444] text-sm font-medium"
            >
              <AlertTriangle size={16} />
              Reset all data
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[#f5f5f5]">This will delete all workouts, logs, and progress. Are you sure?</p>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex-1 bg-[#ef4444] text-white font-semibold py-2.5 rounded-xl text-sm"
                >
                  {resetting ? 'Resetting…' : 'Yes, reset everything'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="flex-1 bg-[#242424] text-[#888888] font-semibold py-2.5 rounded-xl text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-[#888888] pt-4">
        <p>Workout Tracker</p>
        <p className="mt-1">Data stored locally on this device</p>
      </div>
    </div>
  )
}

function MeasurementEditRow({
  log,
  onSave,
  onCancel,
}: {
  log: BodyweightLog
  onSave: (weight: string, waist: string, neck: string) => void
  onCancel: () => void
}) {
  const [weight, setWeight] = useState(log.weightKg.toString())
  const [waist, setWaist] = useState(log.waistCm?.toString() ?? '')
  const [neck, setNeck] = useState(log.neckCm?.toString() ?? '')

  return (
    <div className="px-3 py-2.5 space-y-2 bg-[#1f1f1f] border-b border-[#2a2a2a]/50">
      <div className="flex gap-2">
        <div className="flex-1">
          <p className="text-xs text-[#888888] mb-1">Weight</p>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              value={weight}
              onChange={e => setWeight(e.target.value)}
              onFocus={e => e.target.select()}
              className="flex-1 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#f97316] outline-none"
            />
            <span className="text-xs text-[#888888]">kg</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#888888] mb-1">Waist</p>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              value={waist}
              onChange={e => setWaist(e.target.value)}
              onFocus={e => e.target.select()}
              className="flex-1 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#f97316] outline-none"
            />
            <span className="text-xs text-[#888888]">cm</span>
          </div>
        </div>
        <div className="flex-1">
          <p className="text-xs text-[#888888] mb-1">Neck</p>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              value={neck}
              onChange={e => setNeck(e.target.value)}
              onFocus={e => e.target.select()}
              className="flex-1 bg-[#242424] text-[#f5f5f5] text-center text-sm rounded-lg px-2 py-1.5 border border-[#f97316] outline-none"
            />
            <span className="text-xs text-[#888888]">cm</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(weight, waist, neck)}
          className="flex-1 bg-[#f97316] text-white text-xs font-semibold py-2 rounded-lg"
        >
          Save
        </button>
        <button onClick={onCancel} className="text-[#888888] px-2">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
