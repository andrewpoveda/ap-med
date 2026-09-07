import { isValidEmail } from '@/lib/validate'

export type CohortSupport = { name: string; email: string; instructions: string }
export const DEFAULT_COHORT_SUPPORT: CohortSupport = {
  name: 'AP MED program support', email: 'mentors@ap-med.org', instructions: '',
}

export function readCohortSupport(config: unknown): CohortSupport {
  const value = (config && typeof config === 'object' && 'support' in config) ? config.support : null
  if (!value || typeof value !== 'object') return DEFAULT_COHORT_SUPPORT
  const support = value as Record<string, unknown>
  return {
    name: typeof support.name === 'string' && support.name.trim() ? support.name.trim().slice(0, 150) : DEFAULT_COHORT_SUPPORT.name,
    email: typeof support.email === 'string' && isValidEmail(support.email.trim()) ? support.email.trim() : DEFAULT_COHORT_SUPPORT.email,
    instructions: typeof support.instructions === 'string' ? support.instructions.slice(0, 2000) : '',
  }
}

export function supportMailto(support: CohortSupport, cohortName: string, memberId: string) {
  return `mailto:${support.email}?subject=${encodeURIComponent(`${cohortName}: match help / reassignment request`)}&body=${encodeURIComponent(`Program: ${cohortName}\nMember reference: ${memberId}\n\nPlease describe the help you need. Do not include patient or other sensitive information.\n`)}`
}
