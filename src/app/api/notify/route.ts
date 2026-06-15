import { NextResponse } from 'next/server'
import { notifyMentorOfMatch } from '@/lib/email'
import type { ScoredMentor } from '@/types/mentor'

export const runtime = 'nodejs'

type MenteeData = {
  full_name: string
  email: string
  school: string
  current_stage: string
  interests: string[]
  help_with: string[]
  preferred_identity: string[]
  notes?: string
  linkedin_url?: string
}

export async function POST(request: Request) {
  try {
    const { mentor, mentee }: { mentor: ScoredMentor; mentee: MenteeData } = await request.json()
    await notifyMentorOfMatch(mentor, mentee)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Notify error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
