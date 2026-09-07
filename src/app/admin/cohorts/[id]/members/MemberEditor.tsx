'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
export default function MemberEditor({ id, cohortId, role, fields }: {
  id: string; cohortId: string; role: 'mentor' | 'mentee'; fields: Record<string, string>
}) {
  const router = useRouter()
  const [values, setValues] = useState(fields)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/cohort-members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cohortId, role, changes: values, reason, expected: fields }) })
      const data = await res.json()
      setMessage(data.error ?? 'Saved. Changes and reason recorded.')
      if (res.ok) router.refresh()
    } catch { setMessage('Could not reach the server. Please refresh.') }
    finally { setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-3 mt-3">
    {Object.entries(values).map(([key, value]) => <label key={key} className="block">
      <span className="block text-sm">{key.replaceAll('_', ' ')}</span>
      {key === 'membership_status' ? <select className="border rounded p-2" value={value} onChange={e => setValues({ ...values, [key]: e.target.value })}>
        <option value="active">Active</option><option value="withdrawn">Withdrawn</option><option value="offboarded">Offboarded</option>
      </select> : <input className="border rounded p-2 w-full" value={value} maxLength={key === 'bio' ? 2000 : 500} required={['first_name', 'full_name'].includes(key)} onChange={e => setValues({ ...values, [key]: e.target.value })} />}
    </label>)}
    <label className="block">Reason for change<textarea className="block border rounded p-2 w-full" required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <button className="border rounded px-3 py-2" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
    {message && <p role="status">{message}</p>}
  </form>
}
