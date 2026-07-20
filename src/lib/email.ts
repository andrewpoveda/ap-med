import { Resend } from 'resend'
import type { ScoredMentor } from '@/types/mentor'
import { safeUrl } from '@/lib/url'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Escape a string for safe insertion into HTML text OR a quoted attribute value.
 * Must run on every mentee-supplied field before it enters the email markup,
 * otherwise a crafted note/name/url can inject markup into the mentor's inbox.
 */
function escapeHtml(str: string | null | undefined): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type MenteeInfo = {
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

export async function notifyMentorOfMatch(mentor: ScoredMentor, mentee: MenteeInfo) {
  const mentorName = `${mentor.first_name} ${mentor.last_name}`
  const specialtyOverlap = mentee.interests.filter(s => (Array.isArray(mentor.specialty) ? mentor.specialty : []).includes(s))
  const identityOverlap = mentee.identity.filter(id => (Array.isArray(mentor.identity) ? mentor.identity : []).includes(id))

  const conversationStarters = buildConversationStarters(mentee, specialtyOverlap, identityOverlap)

  const { error } = await resend.emails.send({
    from: 'AP MED Mentors <mentors@ap-med.org>',
    to: mentor.email,
    replyTo: mentee.email,
    subject: `New mentorship request from ${mentee.full_name} (${mentor.matchPercent}% match)`,
    html: buildEmailHtml({ mentor, mentee, conversationStarters, specialtyOverlap, identityOverlap }),
  })

  if (error) {
    console.error(`Failed to notify mentor ${mentorName}:`, error)
    throw error
  }
}

/**
 * Confirmation email sent to the mentee after their request reaches the mentor.
 * Best-effort: the caller logs and swallows failures so a bounced confirmation
 * never undoes the mentor notification.
 */
export async function notifyMenteeOfRequest(params: {
  menteeEmail: string
  menteeFirstName: string
  mentorName: string
  /** Self-serve booking link (server-built /schedule/<token> URL). */
  scheduleUrl?: string
}) {
  const { menteeEmail, menteeFirstName, mentorName, scheduleUrl } = params
  const safeFirst = escapeHtml(menteeFirstName)
  const safeMentor = escapeHtml(mentorName)
  // Server-constructed URL, but run through the same guard as every href.
  const safeSchedule = scheduleUrl ? safeUrl(scheduleUrl) : '#'
  const scheduleBlock =
    scheduleUrl && safeSchedule !== '#'
      ? `
    <p style="margin:0 0 24px;">
      <a href="${escapeHtml(safeSchedule)}"
         style="display:inline-block;background:#c8a96e;color:#1a1a2e;padding:10px 22px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;">
        Pick a time with ${safeMentor} &rarr;
      </a>
    </p>
    <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;font-size:13px;">
      If your mentor has shared bookable hours, that link lets you grab a time
      directly — a calendar invite with a Google Meet link goes to you both.
      It stays valid for about two months.
    </p>`
      : ''

  const { error } = await resend.emails.send({
    from: 'AP MED Mentors <mentors@ap-med.org>',
    to: menteeEmail,
    replyTo: 'mentors@ap-med.org',
    // Subject is plain text (not HTML) — use the raw name, not the escaped one.
    subject: `Your request to ${mentorName} is on its way`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">
    <p style="color:#60a5fa;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">AP MED MENTORS</p>
    <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">Your request is on its way</h1>
    <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;">
      Hi ${safeFirst}, we've passed your request along to <strong style="color:#e2e8f0;">${safeMentor}</strong>.
      Mentors reply directly to you by email whenever they're able to take someone on.
    </p>
    ${scheduleBlock}
    <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;">
      If you haven't heard back within about a week, just reply to this email and the AP MED team
      will help you connect with another mentor — no worries at all.
    </p>
    <hr style="border:none;border-top:1px solid #1e2330;margin:24px 0;" />
    <p style="color:#64748b;font-size:12px;line-height:1.6;">
      Questions any time? Reply to this email or reach us at mentors@ap-med.org.
      <br/><br/>
      — Andrew, AP MED
    </p>
  </div>
</body>
</html>
    `,
  })

  if (error) {
    console.error(`Failed to send mentee confirmation to ${menteeEmail}:`, error)
    throw error
  }
}

/**
 * Cohort match activation email (ascenso-prm.md §5.4) — one per party, sent by
 * the admin activate route after board approval. All recipient/partner fields
 * are resolved server-side from DB rows by the caller; everything interpolated
 * into the HTML is escaped here. replyTo is the partner, so replying starts the
 * actual mentorship conversation.
 */
export async function notifyCohortMatchActivated(params: {
  recipientEmail: string
  recipientName: string
  recipientRole: 'mentor' | 'mentee'
  partnerName: string
  partnerEmail: string
  cohortName: string
}) {
  const { recipientEmail, recipientName, recipientRole, partnerName, partnerEmail, cohortName } = params
  const partnerLabel = recipientRole === 'mentor' ? 'mentee' : 'mentor'
  const safeFirst = escapeHtml(recipientName.trim().split(/\s+/)[0])
  const safePartner = escapeHtml(partnerName)
  const safePartnerEmail = escapeHtml(partnerEmail)
  const safeCohort = escapeHtml(cohortName)

  const { error } = await resend.emails.send({
    from: 'AP MED Mentors <mentors@ap-med.org>',
    to: recipientEmail,
    replyTo: partnerEmail,
    // Subject is plain text (not HTML) — use the raw values, not escaped ones.
    subject: `You've been matched with ${partnerName} — ${cohortName}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">
    <p style="color:#60a5fa;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">AP MED MENTORS · ${safeCohort}</p>
    <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">Your match is confirmed</h1>
    <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;">
      Hi ${safeFirst}, the ${safeCohort} board has matched you with your ${partnerLabel},
      <strong style="color:#e2e8f0;">${safePartner}</strong>.
    </p>
    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:700;margin:0 0 4px;">${safePartner}</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0;">Your ${partnerLabel} · <a href="mailto:${safePartnerEmail}" style="color:#60a5fa;">${safePartnerEmail}</a></p>
    </div>
    <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;">
      ${partnerLabel === 'mentee' ? 'They received this same introduction, so feel free to reach out first — a short hello and a time to meet is all it takes to get started.' : 'Your mentor received this same introduction. Go ahead and say hello — suggest a couple of times that work for a first conversation.'}
    </p>
    <a href="mailto:${safePartnerEmail}" style="display:inline-block;background:#60a5fa;color:#0f1117;border-radius:8px;padding:12px 28px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">
      Email ${safePartner} →
    </a>
    <hr style="border:none;border-top:1px solid #1e2330;margin:24px 0;" />
    <p style="color:#64748b;font-size:12px;line-height:1.6;">
      You received this because you're part of ${safeCohort} on AP MED Mentors.
      Questions any time? Reply to this email or reach us at mentors@ap-med.org.
      <br/><br/>
      — Andrew, AP MED
    </p>
  </div>
</body>
</html>
    `,
  })

  if (error) {
    console.error(`Failed to send match activation email to ${recipientEmail}:`, error)
    throw error
  }
}

/**
 * Cohort announcement blast (ascenso-prm.md §5.10) — the admin composes one
 * subject/body and the send route resolves recipients from cohort membership.
 * Sent as a Resend BATCH with one message per recipient (never a shared to/cc),
 * so the cohort roster is never disclosed to the recipients. Batch is
 * all-or-nothing at the API level: on success every recipient was accepted, on
 * error none were — the caller rolls back the announcement row and retries.
 * subject is pre-sanitized to a single line by the caller; body + subject +
 * cohort name are all escaped here before entering the markup.
 */
export async function sendCohortAnnouncement(params: {
  recipients: string[]
  cohortName: string
  subject: string
  body: string
}): Promise<{ sent: string[] }> {
  const { recipients, cohortName, subject, body } = params
  const html = buildAnnouncementHtml({ cohortName, subject, body })

  const { error } = await resend.batch.send(
    recipients.map((to) => ({
      from: 'AP MED Mentors <mentors@ap-med.org>',
      to,
      replyTo: 'mentors@ap-med.org',
      // Subject is plain text (not HTML); the caller has already collapsed any
      // newlines out of it, so use the raw value, not the escaped one.
      subject,
      html,
    })),
  )

  if (error) {
    console.error('Announcement batch send failed:', error)
    throw error
  }
  return { sent: recipients }
}

/**
 * Daily digest batch (ascenso-prm.md §5.9) — one personalized email per member
 * with ALL of their pending items, sent by the cron route after the cooldown +
 * budget guards. Recipients/items are computed server-side from DB rows
 * (src/lib/digest.ts); every interpolated value is escaped here. Same Resend
 * batch semantics as announcements: one message per recipient, all-or-nothing
 * at the API level, so the caller logs email_log rows only on success.
 */
export async function sendCohortDigests(
  recipients: {
    email: string
    firstName: string
    cohortName: string
    items: { text: string }[]
  }[],
): Promise<void> {
  const { error } = await resend.batch.send(
    recipients.map((recipient) => ({
      from: 'AP MED Mentors <mentors@ap-med.org>',
      to: recipient.email,
      replyTo: 'mentors@ap-med.org',
      // Subject is plain text (not HTML) — raw values, not escaped ones.
      subject: `Your ${recipient.cohortName} check-in — ${recipient.items.length} ${
        recipient.items.length === 1 ? 'item' : 'items'
      } waiting`,
      html: buildDigestHtml(recipient),
    })),
  )
  if (error) {
    console.error('Digest batch send failed:', error)
    throw error
  }
}

function buildDigestHtml({
  firstName,
  cohortName,
  items,
}: {
  firstName: string
  cohortName: string
  items: { text: string }[]
}): string {
  const safeFirst = escapeHtml(firstName)
  const safeCohort = escapeHtml(cohortName)
  const itemsHtml = items
    .map(
      (item) =>
        `<li style="margin:0 0 10px;color:#cbd5e1;font-size:14px;line-height:1.6;">${escapeHtml(item.text)}</li>`,
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">
    <p style="color:#60a5fa;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">AP MED MENTORS · ${safeCohort}</p>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;">Your mentorship check-in</h1>
    <p style="color:#94a3b8;margin:0 0 24px;line-height:1.6;">
      Hi ${safeFirst}, a few things in ${safeCohort} are waiting on you:
    </p>
    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <ul style="margin:0;padding-left:18px;">${itemsHtml}</ul>
    </div>
    <a href="https://www.ap-med.org/dashboard" style="display:inline-block;background:#60a5fa;color:#0f1117;border-radius:8px;padding:12px 28px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">
      Open your dashboard →
    </a>
    <hr style="border:none;border-top:1px solid #1e2330;margin:24px 0;" />
    <p style="color:#64748b;font-size:12px;line-height:1.6;">
      You received this because you're part of ${safeCohort} on AP MED Mentors.
      We send at most one check-in a week (plus a heads-up the day before a
      scheduled session). Questions any time? Just reply to this email.
      <br/><br/>
      — Andrew, AP MED
    </p>
  </div>
</body>
</html>
  `
}

function buildAnnouncementHtml({
  cohortName,
  subject,
  body,
}: {
  cohortName: string
  subject: string
  body: string
}): string {
  const safeCohort = escapeHtml(cohortName)
  const safeSubject = escapeHtml(subject)
  // Preserve the admin's paragraph breaks: escape first, then turn newlines
  // into <br/> so no raw markup can be injected via the body.
  const safeBody = escapeHtml(body).replace(/\r?\n/g, '<br/>')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">
    <p style="color:#60a5fa;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">AP MED MENTORS · ${safeCohort}</p>
    <h1 style="font-size:22px;font-weight:700;margin:0 0 20px;">${safeSubject}</h1>
    <div style="color:#cbd5e1;font-size:15px;line-height:1.7;margin:0 0 24px;">${safeBody}</div>
    <hr style="border:none;border-top:1px solid #1e2330;margin:24px 0;" />
    <p style="color:#64748b;font-size:12px;line-height:1.6;">
      You received this because you're part of ${safeCohort} on AP MED Mentors.
      Questions any time? Just reply to this email and it reaches the AP MED team.
      <br/><br/>
      — Andrew, AP MED
    </p>
  </div>
</body>
</html>
  `
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
  conversationStarters,
  specialtyOverlap,
  identityOverlap,
}: {
  mentor: ScoredMentor
  mentee: MenteeInfo
  conversationStarters: string[]
  specialtyOverlap: string[]
  identityOverlap: string[]
}): string {
  const tagsHtml = (items: string[], color: string) =>
    items.map(i => `<span style="background:${color};padding:2px 10px;border-radius:9999px;font-size:12px;margin-right:4px;">${escapeHtml(i)}</span>`).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#0f1117;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:580px;margin:0 auto;padding:40px 24px;">

    <p style="color:#60a5fa;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">AP MED MENTORS</p>
    <h1 style="font-size:24px;font-weight:700;margin:0 0 8px;">New mentorship request</h1>
    <p style="color:#94a3b8;margin:0 0 32px;">Hi ${escapeHtml(mentor.first_name)}, someone found you as a <strong style="color:#4ade80;">${mentor.matchPercent}% match</strong> and wants to connect.</p>

    <div style="background:#111827;border:1px solid #1e3a5f;border-radius:12px;padding:24px;margin-bottom:24px;">
      <h2 style="font-size:16px;font-weight:700;margin:0 0 4px;">${escapeHtml(mentee.full_name)}</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 16px;">${escapeHtml(mentee.school)} · ${escapeHtml(mentee.current_stage)}</p>

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
      <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0;font-style:italic;">"${escapeHtml(mentee.notes)}"</p>
      ` : ''}
    </div>

    ${conversationStarters.length > 0 ? `
    <div style="background:#0f1117;border:1px solid #1e2330;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 12px;">Conversation starters</p>
      <ul style="margin:0;padding-left:20px;color:#94a3b8;font-size:14px;line-height:2;">
        ${conversationStarters.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
      </ul>
    </div>
    ` : ''}

    <a href="mailto:${escapeHtml(mentee.email)}" style="display:inline-block;background:#60a5fa;color:#0f1117;border-radius:8px;padding:12px 28px;font-weight:700;font-size:15px;text-decoration:none;margin-bottom:24px;">
      Reply to ${escapeHtml(mentee.full_name.split(' ')[0])} →
    </a>

    ${mentee.linkedin_url ? `<p style="font-size:13px;color:#64748b;margin:0 0 24px;"><a href="${escapeHtml(safeUrl(mentee.linkedin_url))}" style="color:#60a5fa;">View their LinkedIn</a></p>` : ''}

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
