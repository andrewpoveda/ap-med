import { Resend } from 'resend'
import type { ScoredMentor } from '@/app/api/match/route'

const resend = new Resend(process.env.RESEND_API_KEY)

type MenteeInfo = {
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

export async function notifyMentorOfMatch(mentor: ScoredMentor, mentee: MenteeInfo) {
  const mentorName = `${mentor.first_name} ${mentor.last_name}`
  const specialtyOverlap = mentee.interests.filter(s => (mentor.specialty || []).includes(s))
  const identityOverlap = mentee.preferred_identity.filter(id => (mentor.identity || []).includes(id))

  const conversationStarters = buildConversationStarters(mentee, specialtyOverlap, identityOverlap)

  const { error } = await resend.emails.send({
    from: 'AP MED Mentors <mentors@ap-med.org>',
    to: mentor.email,
    replyTo: mentee.email,
    subject: `New mentorship request from ${mentee.full_name} (${mentor.matchPercent}% match)`,
    html: buildEmailHtml({ mentor, mentee, mentorName, conversationStarters, specialtyOverlap, identityOverlap }),
  })

  if (error) {
    console.error(`Failed to notify mentor ${mentorName}:`, error)
    throw error
  }
}

function buildConversationStarters(
  mentee: MenteeInfo,
  specialtyOverlap: string[],
  identityOverlap: string[]
): string[] {
  const starters: string[] = []

  if (mentee.current_stage) {
    starters.push(`What advice do you wish you had during your ${mentee.current_stage} phase?`)
  }
  if (specialtyOverlap.length > 0) {
    starters.push(`${mentee.full_name.split(' ')[0]} is exploring ${specialtyOverlap[0]} — what drew you to that path?`)
  }
  if (identityOverlap.length > 0) {
    starters.push(`As someone who identifies as ${identityOverlap[0]}, what unique challenges did you navigate in medicine?`)
  }
  if (mentee.help_with.includes('Personal statement review')) {
    starters.push('Would you be open to reviewing their personal statement draft?')
  }
  if (mentee.help_with.includes('Mock interviews')) {
    starters.push('They mentioned wanting to practice mock interviews — is that something you can help with?')
  }

  return starters.slice(0, 3)
}

function buildEmailHtml({
  mentor,
  mentee,
  mentorName,
  conversationStarters,
  specialtyOverlap,
  identityOverlap,
}: {
  mentor: ScoredMentor
  mentee: MenteeInfo
  mentorName: string
  conversationStarters: string[]
  specialtyOverlap: string[]
  identityOverlap: string[]
}): string {
  const tagsHtml = (items: string[], color: string) =>
    items.map(i => `<span style="background:${color};padding:2px 10px;border-radius:9999px;font-size:12px;margin-right:4px;">${i}</span>`).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">

    <p style="color:#60a5fa;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">AP MED MENTORS</p>
    <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">New mentorship request</h1>
    <p style="color:#94a3b8;margin:0 0 32px;">Hi ${mentor.first_name}, someone found you as a <strong style="color:#4ade80;">${mentor.matchPercent}% match</strong> and wants to connect.</p>

    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:700;margin:0 0 4px;">${mentee.full_name}</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">${mentee.school} · ${mentee.current_stage}</p>

      ${specialtyOverlap.length > 0 ? `
      <p style="font-size:12px;color:#64748b;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Shared specialty interest</p>
      <div style="margin-bottom:16px;">${tagsHtml(specialtyOverlap, '#1e2d45')}</div>
      ` : ''}

      ${identityOverlap.length > 0 ? `
      <p style="font-size:12px;color:#64748b;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Shared identity</p>
      <div style="margin-bottom:16px;">${tagsHtml(identityOverlap, '#1e2d30')}</div>
      ` : ''}

      ${mentee.help_with.length > 0 ? `
      <p style="font-size:12px;color:#64748b;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Looking for help with</p>
      <div style="margin-bottom:16px;">${tagsHtml(mentee.help_with, '#1e1e2d')}</div>
      ` : ''}

      ${mentee.notes ? `
      <p style="font-size:12px;color:#64748b;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">Their note</p>
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0;font-style:italic;">"${mentee.notes}"</p>
      ` : ''}
    </div>

    ${conversationStarters.length > 0 ? `
    <div style="background:#0f1117;border:1px solid #1e2330;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;">Conversation starters</p>
      <ul style="margin:0;padding-left:20px;color:#94a3b8;font-size:14px;line-height:2;">
        ${conversationStarters.map(s => `<li>${s}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <a href="mailto:${mentee.email}" style="display:inline-block;background:#60a5fa;color:#0f1117;border-radius:8px;padding:12px 28px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">
      Reply to ${mentee.full_name.split(' ')[0]} →
    </a>

    ${mentee.linkedin_url ? `<p style="font-size:13px;color:#64748b;margin:0 0 24px;"><a href="${mentee.linkedin_url}" style="color:#60a5fa;">View their LinkedIn</a></p>` : ''}

    <hr style="border:none;border-top:1px solid #1e2330;margin:24px 0;" />
    <p style="color:#64748b;font-size:12px;line-height:1.6;">
      You received this because you're listed as an AP MED Mentor.
      If you're unable to take on a mentee right now, just reply and let us know — no worries at all.
      <br/><br/>
      — Andrew, AP MED
    </p>
  </div>
</body>
</html>
  `
}
