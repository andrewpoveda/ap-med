export type Mentor = {
  id: string
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
  mentee_capacity: number
  email: string
  photo_url?: string
}

export type ScoredMentor = Mentor & { matchPercent: number }
