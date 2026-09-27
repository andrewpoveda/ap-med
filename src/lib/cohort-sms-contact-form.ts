/** The same form keys are used by every cohort application that collects SMS contact details. */
export type CohortSmsContactFormValue = {
  phone_number: string
  sms_consent: boolean
}

/** A consent choice applies to one phone number, so editing that number clears it. */
export function withSmsPhoneChange<T extends CohortSmsContactFormValue>(
  previous: T,
  phoneNumber: string,
): T {
  return {
    ...previous,
    phone_number: phoneNumber,
    sms_consent: phoneNumber === previous.phone_number ? previous.sms_consent : false,
  }
}

export function withSmsConsentChange<T extends CohortSmsContactFormValue>(
  previous: T,
  consent: boolean,
): T {
  return { ...previous, sms_consent: consent }
}
