'use client'
import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { db } from '@/lib/db'

export function BodyweightModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [value, setValue] = useState('')

  async function handleSave() {
    const kg = parseFloat(value)
    if (isNaN(kg) || kg <= 0) return
    await db.bodyweightLogs.add({
      weightKg: kg,
      loggedAt: new Date().toISOString().split('T')[0],
    })
    setValue('')
    onClose()
  }

  return (
    <Dialog.Root open={open} onOpenChange={v => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] rounded-t-3xl p-6 border-t border-[#2a2a2a] max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-lg font-semibold">Log Body Weight</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-[#888888]"><X size={20} /></button>
            </Dialog.Close>
          </div>

          <div className="flex items-center gap-3 mb-6">
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="78.5"
              autoFocus
              className="flex-1 bg-[#242424] text-[#f5f5f5] text-2xl font-bold text-center rounded-xl px-4 py-4 border border-[#2a2a2a] focus:border-[#f97316] outline-none"
            />
            <span className="text-[#888888] text-lg">kg</span>
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-[#f97316] text-white font-semibold py-3.5 rounded-xl"
          >
            Save
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
