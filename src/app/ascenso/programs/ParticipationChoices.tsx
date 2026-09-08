'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ParticipationChoices({ choices }: { choices: { key: string; label: string }[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function select(participation: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/participation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ participation }) })
      const data = await res.json()
      if (!res.ok) setMessage(data.error ?? 'Could not choose program')
      else { router.push(data.destination); router.refresh() }
    } catch { setMessage('Could not reach the server. Refresh before continuing.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3">
    {choices.map(c => <button key={c.key} className="block border rounded p-4 text-left w-full" disabled={busy} onClick={() => select(c.key)}>{c.label}</button>)}
    <p role="status">{message}</p>
  </div>
}
