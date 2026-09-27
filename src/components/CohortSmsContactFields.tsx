'use client'

import type { CSSProperties, Dispatch, SetStateAction } from 'react'
import { onboardingInputStyle, onboardingLabelStyle } from '@/components/styles'
import { SMS_CONSENT_NOTICE } from '@/lib/sms-consent'
import {
  type CohortSmsContactFormValue,
  withSmsConsentChange,
  withSmsPhoneChange,
} from '@/lib/cohort-sms-contact-form'

type Props<T extends CohortSmsContactFormValue> = {
  value: T
  setValue: Dispatch<SetStateAction<T>>
  idPrefix: string
}

/** Reusable, optional phone collection and explicit SMS permission for cohort applications. */
export function CohortSmsContactFields<T extends CohortSmsContactFormValue>({
  value,
  setValue,
  idPrefix,
}: Props<T>) {
  const phoneId = `${idPrefix}-sms-phone`
  const helpId = `${phoneId}-help`

  return (
    <div>
      <h3>Text reminders and check-ins (optional)</h3>
      <label style={onboardingLabelStyle} htmlFor={phoneId}>US mobile phone number</label>
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
      />
      <p id={helpId} style={{ margin: '0 0 1rem', color: '#6b6b6b', fontSize: '0.875rem', lineHeight: 1.55 }}>
        Providing a number does not sign you up for texts. You can take part in the cohort without SMS.
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
