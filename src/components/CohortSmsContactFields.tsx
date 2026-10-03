'use client'

import Link from 'next/link'
import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { onboardingInputStyle, onboardingLabelStyle } from '@/components/styles'
import { SMS_CONSENT_NOTICE } from '@/lib/sms-consent'
import type { CohortSmsCollectionMode } from '@/lib/cohort-sms-collection'
import {
  type CohortSmsContactFormValue,
  withSmsConsentChange,
  withSmsPhoneChange,
} from '@/lib/cohort-sms-contact-form'

type Props<T extends CohortSmsContactFormValue> = {
  value: T
  setValue: Dispatch<SetStateAction<T>>
  idPrefix: string
  mode: CohortSmsCollectionMode
}

/** Reusable cohort phone collection and separate, optional SMS permission. */
export function CohortSmsContactFields<T extends CohortSmsContactFormValue>({
  value,
  setValue,
  idPrefix,
  mode,
}: Props<T>) {
  const phoneId = `${idPrefix}-sms-phone`
  const helpId = `${phoneId}-help`

  if (mode === 'off') return null

  return (
    <div>
      <h3>Phone and optional text reminders</h3>
      <label style={onboardingLabelStyle} htmlFor={phoneId}>
        US mobile phone number{mode === 'required' ? ' *' : ' (optional)'}
      </label>
      <input
        id={phoneId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(201) 555-0123"
        value={value.phone_number}
        onChange={event => {
          const phoneNumber = event.target.value
          setValue(previous => withSmsPhoneChange(previous, phoneNumber))
        }}
        style={onboardingInputStyle}
        aria-describedby={helpId}
        required={mode === 'required'}
      />
      <p id={helpId} style={{ margin: '0 0 1rem', color: '#6b6b6b', fontSize: '0.875rem', lineHeight: 1.55 }}>
        {mode === 'required'
          ? 'This cohort requires a phone number, but text reminders and check-ins are optional. Adding a number does not sign you up for texts.'
          : 'Providing a number does not sign you up for texts. You can take part in the cohort without SMS.'}
      </p>
      <label style={consentCardStyle(value.sms_consent)}>
        <input
          type="checkbox"
          checked={value.sms_consent}
          onChange={event => {
            const consent = event.target.checked
            setValue(previous => withSmsConsentChange(previous, consent))
          }}
          style={{ accentColor: '#c8a96e' }}
        />
        {SMS_CONSENT_NOTICE}
      </label>
      <p className="mt-3 text-sm text-[#6b6b6b]">
        Read the <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
        {' '}and <Link href="/terms#sms" className="underline underline-offset-4">SMS Terms of Service</Link>.
      </p>
    </div>
  )
}

const consentCardStyle = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  background: selected ? '#f5efe2' : '#ffffff',
  border: `1px solid ${selected ? '#c8a96e' : '#e8e4dc'}`,
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '0.875rem',
  color: selected ? '#8a6a2f' : '#4a4a5a',
  transition: 'all 0.15s',
})
