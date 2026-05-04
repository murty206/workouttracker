'use client'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'
import { exportAll, importAll } from '@/lib/backup'
import { AlertTriangle, Download, Upload, ChevronRight } from 'lucide-react'
import Link from 'next/link'

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

  const gender = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('gender')
    return (pref?.value ?? 'male') as 'male' | 'female'
  }, [])

  const restBarbell = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('rest_barbell')
    return Number(pref?.value ?? 90)
  }, [])

  const restOther = useLiveQuery(async () => {
    const pref = await db.userPrefs.get('rest_other')
    return Number(pref?.value ?? 60)
  }, [])

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

  return (
    <div className="py-6 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Gender */}
      <div className="bg-[#1a1a1a] rounded-2xl border border-[#2a2a2a] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a2a2a]">
          <p className="text-xs text-[#888888] uppercase tracking-wider">Profile</p>
        </div>
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
        <Link href="/exercises" className="px-4 py-2.5 flex items-center justify-between border-t border-[#2a2a2a]">
          <p className="text-xs text-[#888888]">Fine-tune per exercise</p>
          <ChevronRight size={14} className="text-[#444444]" />
        </Link>
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
