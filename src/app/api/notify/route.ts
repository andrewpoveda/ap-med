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
  identity: string[]
  notes?: string
  linkedin_url?: string
}

export async function POST(request: Request) {
  try {
    const dryRun = new URL(request.url).searchParams.get('test') === '1'
    const { mentor, mentee }: { mentor: ScoredMentor; mentee: MenteeData } = await request.json()
    if (dryRun) {
      console.log(`[dry-run] Skipped notify email to ${mentor?.email ?? '(none)'}`)
      return NextResponse.json({ success: true, dryRun: true })
    }
    await notifyMentorOfMatch(mentor, mentee)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Notify error:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }
}
