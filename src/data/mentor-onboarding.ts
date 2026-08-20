// Shared mentor-onboarding vocabularies. The client renders these choices and
// the public API allowlists against the same values, so a stale or manipulated
// client cannot store options the rest of the platform does not understand.
export const MENTOR_STAGE_OPTIONS = [
  "Pre-med / Undergrad",
  "Post-bacc",
  "MD / DO Student",
  "Resident",
  "Fellow",
  "Attending Physician",
  "Faculty / Dean / Administrator",
]

export const MENTOR_CONTACT_OPTIONS = [
  "Email",
  "LinkedIn",
  "Scheduling link",
  "AP MED form only",
]

export const MENTOR_CAPACITY_OPTIONS = [
  "1",
  "2–3",
  "4 or more",
  "None right now — add me to the waitlist",
]
