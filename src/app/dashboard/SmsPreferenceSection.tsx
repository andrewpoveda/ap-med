'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { cardStyle, eyebrowStyle, goldButton, inputStyle } from '@/components/styles'
import type { MemberSmsPreference } from '@/lib/cohort-sms'
import { normalizeUsPhoneNumber, SMS_CONSENT_NOTICE } from '@/lib/sms-consent'

export default function SmsPreferenceSection({
  preference,
  sendingEnabled,
}: {
  preference: MemberSmsPreference | null
  sendingEnabled: boolean
}) {
  const router = useRouter()
  const [phoneNumber, setPhoneNumber] = useState(preference?.phoneE164 ?? '')
  const [smsConsent, setSmsConsent] = useState(preference?.consented ?? false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [observedContact, setObservedContact] = useState({
    id: preference?.contactId ?? null,
    revision: preference?.revision ?? null,
  })

  useEffect(() => {
    setObservedContact({ id: preference?.contactId ?? null, revision: preference?.revision ?? null })
    setPhoneNumber(preference?.phoneE164 ?? '')
    setSmsConsent(preference?.consented ?? false)
  }, [preference?.contactId, preference?.revision, preference?.phoneE164, preference?.consented])

  async function savePreference(nextPhone: string, nextConsent: boolean) {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const result = await fetch('/api/cohort-sms-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: nextPhone, smsConsent: nextConsent,
          expectedContactId: observedContact.id, expectedContactRevision: observedContact.revision }),
      })
      const body = await result.json().catch(() => null) as { error?: string; phoneE164?: string } | null
      if (!result.ok) {
        setError(body?.error ?? 'Could not save your text preference. Please try again.')
        if (result.status === 409) router.refresh()
        return
      }
      setPhoneNumber(body?.phoneE164 ?? nextPhone)
      setSmsConsent(nextConsent)
      setMessage(nextConsent ? 'Your text preference was saved.' :
        nextPhone ? 'Texts are turned off for this cohort.' : 'Your phone number and SMS consent were removed.')
      router.refresh()
    } catch {
      setError('Could not save your text preference. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    await savePreference(phoneNumber, smsConsent)
  }

  return (
    <div style={cardStyle}>
      <p style={eyebrowStyle}>Optional text reminders</p>
      <p className="text-sm text-[#6b6b6b]">
        {sendingEnabled
          ? 'Add a US mobile number if you would like meeting reminders and simple meeting check-ins by text. Your web dashboard and email notifications work either way.'
          : 'Text sending is paused for this cohort. You can still turn off consent or remove your saved number.'}
      </p>
      {sendingEnabled ? <form onSubmit={save} className="mt-4 space-y-4">
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
            onChange={event => {
              const nextPhone = event.target.value
              setPhoneNumber(nextPhone)
              if (normalizeUsPhoneNumber(nextPhone) !== (preference?.phoneE164 ?? null)) {
                setSmsConsent(false)
              }
            }}
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
      </form> : <div className="mt-4 space-y-3">
        {preference?.phoneE164 && <p className="m-0 text-sm text-[#4a4a5a]">Saved number: {preference.phoneE164}</p>}
        {preference?.consented && preference.phoneE164 && (
          <button type="button" disabled={saving} onClick={() => savePreference(preference.phoneE164!, false)}
            style={{ ...goldButton, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Turn off texts for this cohort'}
          </button>
        )}
        {preference?.phoneE164 && (
          <button type="button" disabled={saving} onClick={() => savePreference('', false)}
            className="block text-sm underline disabled:opacity-60">
            Remove my phone number and SMS consent
          </button>
        )}
        {message && <p className="m-0 text-sm text-[#2f8f5f]" role="status">{message}</p>}
        {error && <p className="m-0 text-sm text-[#a3372b]" role="alert">{error}</p>}
      </div>}
    </div>
  )
}
