'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function GrantEditor({ cohortId, grants }: { cohortId: string; grants: { email: string; revoked: boolean }[] }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function change(target: string, grant: boolean) {
    if (reason.trim().length < 3) { setMessage('Enter a reason for the access change.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/cohort-grants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cohortId, email: target, grant, reason }) })
      const result = await res.json(); setMessage(result.error ?? 'Access updated. No invitation email was sent; share the login instructions directly.'); router.refresh()
    } catch { setMessage('Could not reach the server. Refresh to check access.') }
    finally { setBusy(false) }
  }
  return <section className="space-y-3">
    <h2>Administrator access</h2>
    <p>Grant access using the administrator&apos;s Google sign-in email. Share /login and /admin directly; this does not send an invitation. Revoking this grant removes access to this cohort on subsequent checks and preserves other grants and historical attribution.</p>
    <label className="block">Reason<input className="border rounded p-2 block w-full" maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <form onSubmit={e => { e.preventDefault(); void change(email, true) }} className="flex gap-2 items-end">
      <label>Email<input className="border rounded p-2 block" required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <button className="border rounded p-2" disabled={busy}>Add access</button>
    </form>
    <ul>{grants.map(g => <li key={g.email}>{g.email} · {g.revoked ? 'Revoked' : 'Active'} <button disabled={busy} className="underline" onClick={() => change(g.email, g.revoked)}>{g.revoked ? 'Restore' : 'Revoke'}</button></li>)}</ul>
    <p role="status">{message}</p>
  </section>
}
