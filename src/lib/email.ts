import { Resend } from 'resend'
import type { ScoredMentor } from '@/types/mentor'
import { safeUrl } from '@/lib/url'

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * The site palette, mirrored from the `:root` block in src/app/globals.css.
 * Email inline styles can't read CSS variables, so these literals have to be
 * kept in sync with that file by hand — change one, change both.
 */
const brand = {
  /** Page backdrop behind the card — globals' --global-hover-color. */
  canvas: '#f0ece4',
  /** The content card itself — --global-card-bg. */
  card: '#ffffff',
  /** Inset panels on top of the card — --global-bg-color. */
  panel: '#faf8f4',
  border: '#e8e4dc',
  /** --global-theme-color. Eyebrows, button fills, accents — not body text. */
  gold: '#c8a96e',
  /**
   * Darkened gold for small text. The site's #c8a96e only clears contrast at
   * display sizes; at 12–14px it needs this (4.9:1 on white) to stay readable.
   */
  goldText: '#8a6d3b',
  ink: '#1a1a2e',
  muted: '#6b6b6b',
} as const

const bodyFont = "'Inter','Segoe UI',Calibri,Arial,sans-serif"
/** Stand-in for the site's Instrument Serif, which no mail client will have. */
const headingFont = "Georgia,'Times New Roman',serif"

/**
 * Shared chrome for every email we send: cream canvas, white card, gold eyebrow,
 * serif headline, hairline rule above the small print. Keeping it in one place
 * is what stops the six templates below from drifting apart again.
 *
 * Every argument is interpolated as raw markup, so callers must escape any
 * user-supplied value before it gets here.
 */
function emailShell({
  eyebrow,
  heading,
  body,
  footer,
}: {
  eyebrow: string
  heading: string
  body: string
  /** Small print above the sign-off; the sign-off itself is added here. */
  footer: string
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light only" />
</head>
<body style="margin:0;padding:0;background:${brand.canvas};font-family:${bodyFont};color:${brand.ink};color-scheme:light only;">
  <div style="max-width:580px;margin:0 auto;padding:32px 16px;">
    <div style="background:${brand.card};border:1px solid ${brand.border};border-radius:16px;padding:40px 32px;">
      <p style="color:${brand.gold};font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 10px;">${eyebrow}</p>
      <h1 style="font-family:${headingFont};font-size:28px;font-weight:400;line-height:1.25;color:${brand.ink};margin:0 0 12px;">${heading}</h1>
${body}
      <hr style="border:none;border-top:1px solid ${brand.border};margin:8px 0 24px;" />
      <p style="color:${brand.muted};font-size:12px;line-height:1.7;">
        ${footer}
        <br/><br/>
        — Andrew, AP MED
      </p>
    </div>
  </div>
</body>
</html>
  `
}

/** Gold fill — the site's primary button ("Get Matched"). `href` must be safe. */
function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${brand.gold};color:${brand.ink};border:1px solid ${brand.gold};border-radius:8px;padding:11px 27px;font-weight:600;font-size:15px;text-decoration:none;margin:0 8px 24px 0;">${label}</a>`
}

/** Outlined — the site's secondary button ("Browse Mentors"), pairs beside a primary. */
function secondaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${brand.card};color:${brand.ink};border:1px solid ${brand.ink};border-radius:8px;padding:11px 27px;font-weight:600;font-size:15px;text-decoration:none;margin:0 8px 24px 0;">${label}</a>`
}

/** Inset panel on the card — used wherever a template highlights a block. */
function panel(inner: string): string {
  return `<div style="background:${brand.panel};border:1px solid ${brand.border};border-radius:12px;padding:24px;margin-bottom:24px;">${inner}</div>`
}

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
      ${primaryButton(escapeHtml(safeSchedule), `Pick a time with ${safeMentor} &rarr;`)}
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;font-size:13px;">
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
    html: emailShell({
      eyebrow: 'AP MED MENTORS',
      heading: 'Your request is on its way',
      body: `
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">
        Hi ${safeFirst}, we've passed your request along to <strong style="color:${brand.ink};">${safeMentor}</strong>.
        Mentors reply directly to you by email whenever they're able to take someone on.
      </p>
      ${scheduleBlock}
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">
        If you haven't heard back within about a week, just reply to this email and the AP MED team
        will help you connect with another mentor — no worries at all.
      </p>`,
      footer: 'Questions any time? Reply to this email or reach us at mentors@ap-med.org.',
    }),
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
 *
 * `loginUrl` is the shared /login page, rendered as a second CTA beside "Email
 * <partner>" for BOTH parties — mentors and mentees sign in through the same
 * Google flow, which routes each to their own dashboard. Unlike the magic link it
 * replaced, this URL is not a credential: it carries no token, grants nothing on
 * its own, and is safe in either party's copy of the email. It is also the only
 * place a mentor is told where to sign in, so it isn't optional dressing.
 */
export async function notifyCohortMatchActivated(params: {
  recipientEmail: string
  recipientName: string
  recipientRole: 'mentor' | 'mentee'
  partnerName: string
  partnerEmail: string
  cohortName: string
  /** Server-built absolute URL of /login (never a client-supplied host). */
  loginUrl: string
}) {
  const { recipientEmail, recipientName, recipientRole, partnerName, partnerEmail, cohortName, loginUrl } = params
  const partnerLabel = recipientRole === 'mentor' ? 'mentee' : 'mentor'
  const safeFirst = escapeHtml(recipientName.trim().split(/\s+/)[0])
  const safePartner = escapeHtml(partnerName)
  const safePartnerEmail = escapeHtml(partnerEmail)
  const safeCohort = escapeHtml(cohortName)

  // Server-constructed URL, but run through the same href guard as every other
  // link in this file.
  const safeLoginUrl = safeUrl(loginUrl)
  const accountBlock =
    safeLoginUrl !== '#'
      ? secondaryButton(escapeHtml(safeLoginUrl), 'Sign in with Google &rarr;')
      : ''
  const dashboardPurpose =
    recipientRole === 'mentee'
      ? `you'll see the meetings your mentor logs, track the goals you set
      together, and book sessions with them`
      : `you'll log your meetings, track the goals you set together, and open
      bookable hours so your mentee can pick a time`
  const accountNote =
    safeLoginUrl !== '#'
      ? `
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;font-size:13px;">
        Your ${safeCohort} dashboard is where ${dashboardPurpose}. Sign in at
        <a href="${escapeHtml(safeLoginUrl)}" style="color:${brand.goldText};">${escapeHtml(safeLoginUrl)}</a>
        with the Google account for this email address — no password to set up. We
        use Google only to confirm it's you; we ask for no access to your Gmail,
        Drive, or Calendar.
      </p>`
      : ''

  const { error } = await resend.emails.send({
    from: 'AP MED Mentors <mentors@ap-med.org>',
    to: recipientEmail,
    replyTo: partnerEmail,
    // Subject is plain text (not HTML) — use the raw values, not escaped ones.
    subject: `You've been matched with ${partnerName} — ${cohortName}`,
    html: emailShell({
      eyebrow: `AP MED MENTORS · ${safeCohort}`,
      heading: 'Your match is confirmed',
      body: `
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">
        Hi ${safeFirst}, the ${safeCohort} board has matched you with your ${partnerLabel},
        <strong style="color:${brand.ink};">${safePartner}</strong>.
      </p>
      ${panel(`
        <h2 style="font-family:${headingFont};font-size:19px;font-weight:400;color:${brand.ink};margin:0 0 4px;">${safePartner}</h2>
        <p style="color:${brand.muted};font-size:14px;margin:0;">Your ${partnerLabel} · <a href="mailto:${safePartnerEmail}" style="color:${brand.goldText};">${safePartnerEmail}</a></p>
      `)}
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">
        ${partnerLabel === 'mentee' ? 'They received this same introduction, so feel free to reach out first — a short hello and a time to meet is all it takes to get started.' : 'Your mentor received this same introduction. Go ahead and say hello — suggest a couple of times that work for a first conversation.'}
      </p>
      ${primaryButton(`mailto:${safePartnerEmail}`, `Email ${safePartner} →`)}${accountBlock}
      ${accountNote}`,
      footer: `You received this because you're part of ${safeCohort} on AP MED Mentors.
        Questions any time? Reply to this email or reach us at mentors@ap-med.org.`,
    }),
  })

  if (error) {
    console.error(`Failed to send match activation email to ${recipientEmail}:`, error)
    throw error
  }
}

/**
 * Ascenso mentee sign-in link — the "I lost / expired my link" path for the
 * magic-link flow, sent by /api/ascenso/signin-link.
 *
 * `signInUrl` is a bearer credential for this mentee's account, so the caller
 * must resolve the recipient from the cohort mentee row it looked up by email,
 * never from the address the browser submitted. That is what keeps this from
 * becoming a way to mail someone else's sign-in link to a chosen inbox.
 */
export async function sendAscensoSignInLink(params: {
  recipientEmail: string
  recipientName: string
  cohortName: string
  signInUrl: string
}) {
  const { recipientEmail, recipientName, cohortName, signInUrl } = params
  const safeFirst = escapeHtml(recipientName.trim().split(/\s+/)[0] || 'there')
  const safeCohort = escapeHtml(cohortName)
  // Server-constructed URL, but run through the same guard as every href.
  const safeSignIn = escapeHtml(safeUrl(signInUrl))

  const { error } = await resend.emails.send({
    from: 'AP MED Mentors <mentors@ap-med.org>',
    to: recipientEmail,
    replyTo: 'mentors@ap-med.org',
    // Subject is plain text (not HTML) — use the raw value, not the escaped one.
    subject: `Your ${cohortName} sign-in link`,
    html: emailShell({
      eyebrow: `AP MED MENTORS · ${safeCohort}`,
      heading: "Here's your way back in",
      body: `
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">
        Hi ${safeFirst}, use the button below to sign in to your ${safeCohort}
        dashboard. No password needed.
      </p>
      ${primaryButton(safeSignIn, 'Sign in &rarr;')}
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;font-size:13px;">
        This link works once and expires shortly. If it's already stale by the time
        you tap it, just request another from the dashboard.
      </p>`,
      footer: `If you didn't ask for this link, you can ignore this email — nothing has
        changed on your account. Questions any time? Just reply.`,
    }),
  })

  if (error) {
    console.error(`Failed to send Ascenso sign-in link to ${recipientEmail}:`, error)
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
        `<li style="margin:0 0 10px;color:${brand.ink};font-size:14px;line-height:1.6;">${escapeHtml(item.text)}</li>`,
    )
    .join('')

  return emailShell({
    eyebrow: `AP MED MENTORS · ${safeCohort}`,
    heading: 'Your mentorship check-in',
    body: `
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">
        Hi ${safeFirst}, a few things in ${safeCohort} are waiting on you:
      </p>
      ${panel(`<ul style="margin:0;padding-left:18px;">${itemsHtml}</ul>`)}
      ${primaryButton('https://www.ap-med.org/dashboard', 'Open your dashboard →')}`,
    footer: `You received this because you're part of ${safeCohort} on AP MED Mentors.
        We send at most one check-in a week (plus a heads-up the day before a
        scheduled session). Questions any time? Just reply to this email.`,
  })
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

  return emailShell({
    eyebrow: `AP MED MENTORS · ${safeCohort}`,
    heading: safeSubject,
    body: `
      <div style="color:${brand.ink};font-size:15px;line-height:1.8;margin:8px 0 24px;">${safeBody}</div>`,
    footer: `You received this because you're part of ${safeCohort} on AP MED Mentors.
        Questions any time? Just reply to this email and it reaches the AP MED team.`,
  })
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
    items.map(i => `<span style="background:${color};border:1px solid ${brand.border};color:${brand.ink};padding:3px 10px;border-radius:9999px;font-size:12px;margin-right:4px;">${escapeHtml(i)}</span>`).join('')
  const label = (text: string) =>
    `<p style="font-size:12px;color:${brand.muted};margin:0 0 6px;text-transform:uppercase;letter-spacing:0.05em;">${text}</p>`

  return emailShell({
    eyebrow: 'AP MED MENTORS',
    heading: 'New mentorship request',
    body: `
      <p style="color:${brand.muted};margin:0 0 24px;line-height:1.7;">Hi ${escapeHtml(mentor.first_name)}, someone found you as a <strong style="color:${brand.goldText};">${mentor.matchPercent}% match</strong> and wants to connect.</p>

      ${panel(`
        <h2 style="font-family:${headingFont};font-size:19px;font-weight:400;color:${brand.ink};margin:0 0 4px;">${escapeHtml(mentee.full_name)}</h2>
        <p style="color:${brand.muted};font-size:14px;margin:0 0 16px;">${escapeHtml(mentee.school)} · ${escapeHtml(mentee.current_stage)}</p>

        ${specialtyOverlap.length > 0 ? `
        ${label('Shared specialty interest')}
        <div style="margin-bottom:16px;">${tagsHtml(specialtyOverlap, '#f4ecdb')}</div>
        ` : ''}

        ${identityOverlap.length > 0 ? `
        ${label('Shared identity')}
        <div style="margin-bottom:16px;">${tagsHtml(identityOverlap, '#edefe9')}</div>
        ` : ''}

        ${mentee.help_with.length > 0 ? `
        ${label('Looking for help with')}
        <div style="margin-bottom:16px;">${tagsHtml(mentee.help_with, brand.canvas)}</div>
        ` : ''}

        ${mentee.notes ? `
        ${label('Their note')}
        <p style="color:${brand.ink};font-size:14px;line-height:1.7;margin:0;font-style:italic;">"${escapeHtml(mentee.notes)}"</p>
        ` : ''}
      `)}

      ${conversationStarters.length > 0 ? `
      <div style="border:1px solid ${brand.border};border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        ${label('Conversation starters')}
        <ul style="margin:0;padding-left:20px;color:${brand.muted};font-size:14px;line-height:1.9;">
          ${conversationStarters.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${primaryButton(`mailto:${escapeHtml(mentee.email)}`, `Reply to ${escapeHtml(mentee.full_name.split(' ')[0])} →`)}

      ${mentee.linkedin_url ? `<p style="font-size:13px;color:${brand.muted};margin:0 0 24px;"><a href="${escapeHtml(safeUrl(mentee.linkedin_url))}" style="color:${brand.goldText};">View their LinkedIn</a></p>` : ''}`,
    footer: `You received this because you're listed as an AP MED Mentor.
        If you're unable to take on a mentee right now, just reply and let us know — no worries at all.`,
  })
}
