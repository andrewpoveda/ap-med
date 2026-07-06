export type Mentor = {
  id: string
  created_at: string
  first_name: string
  last_name: string
  credentials: string
  current_role: string
  institution: string
  bio: string
  identity: string[]
  specialty: string[]
  can_help_with: string[]
  current_stage: string
  linkedin_url: string
  episode_url: string
  scheduling_url: string
  contact_method: string[]
  mentee_capacity: string
  open_to_podcast: boolean
  email: string
  notes: string | null
  photo_url?: string
  // Server-side only (not in PUBLIC_MENTOR_COLUMNS). `approved` is the moderation
  // gate (migration 0003); `auth_user_id` links the row to a Supabase auth user
  // on first Google sign-in (migration 0004).
  approved: boolean
  auth_user_id: string | null
}

export type ScoredMentor = Mentor & { matchPercent: number }

// Columns safe to send to the browser. Everything else on the mentor row
// (email, notes, contact_method, mentee_capacity, open_to_podcast,
// scheduling_url, created_at, linkedin_url) stays server-side — /api/notify
// resolves the mentor's email from the DB by id, so no client view needs it.
export const PUBLIC_MENTOR_COLUMNS = [
  'id',
  'first_name',
  'last_name',
  'credentials',
  'current_role',
  'institution',
  'bio',
  'identity',
  'specialty',
  'can_help_with',
  'current_stage',
  'episode_url',
  'photo_url',
] as const

export type PublicMentor = Pick<Mentor, (typeof PUBLIC_MENTOR_COLUMNS)[number]>
export type ScoredPublicMentor = PublicMentor & { matchPercent: number }

export function toPublicMentor(mentor: Mentor): PublicMentor {
  return Object.fromEntries(
    PUBLIC_MENTOR_COLUMNS.map(col => [col, mentor[col]])
  ) as PublicMentor
}
