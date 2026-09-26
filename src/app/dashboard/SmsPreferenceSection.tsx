'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { cardStyle, eyebrowStyle, goldButton, inputStyle } from '@/components/styles'
import type { MemberSmsPreference } from '@/lib/cohort-sms'
import { SMS_CONSENT_NOTICE } from '@/lib/sms-consent'

export default function SmsPreferenceSection({ preference }: { preference: MemberSmsPreference | null }) {
  const router = useRouter()
  const [phoneNumber, setPhoneNumber] = useState(preference?.phoneE164 ?? '')
  const [smsConsent, setSmsConsent] = useState(preference?.consented ?? false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const result = await fetch('/api/cohort-sms-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, smsConsent }),
      })
      const body = await result.json().catch(() => null) as { error?: string; phoneE164?: string } | null
      if (!result.ok) {
        setError(body?.error ?? 'Could not save your text preference. Please try again.')
        return
      }
      if (body?.phoneE164) setPhoneNumber(body.phoneE164)
      setMessage(smsConsent ? 'Your text preference was saved.' : 'Texts are turned off for this cohort.')
      router.refresh()
    } catch {
      setError('Could not save your text preference. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Optional text reminders</p>
      <p className="text-sm text-[#6b6b6b]">
        Add a US mobile number if you would like meeting reminders and simple meeting check-ins by text.
        Your web dashboard and email notifications work either way.
      </p>
      <form onSubmit={save} className="mt-4 space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[#1a1a2e]" htmlFor="cohort-sms-phone">
            Mobile number (optional)
          </label>
          <input
            id="cohort-sms-phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phoneNumber}
            onChange={event => setPhoneNumber(event.target.value)}
            placeholder="(555) 123-4567"
            style={inputStyle}
          />
        </div>
        <label className="flex items-start gap-3 text-sm text-[#4a4a5a]">
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={event => setSmsConsent(event.target.checked)}
            className="mt-1"
          />
          <span>{SMS_CONSENT_NOTICE}</span>
        </label>
        {message && <p className="m-0 text-sm text-[#2f8f5f]" role="status">{message}</p>}
        {error && <p className="m-0 text-sm text-[#a3372b]" role="alert">{error}</p>}
        <button type="submit" disabled={saving} style={{ ...goldButton, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save text preference'}
        </button>
      </form>
    </div>
  )
}
