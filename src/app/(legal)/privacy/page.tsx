import type { Metadata } from 'next'
import Link from 'next/link'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy | AP MED',
  description: 'How AP MED handles mentorship data, mobile numbers, and optional SMS consent.',
  alternates: { canonical: absoluteUrl('/privacy') },
}

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: October 1, 2026</p>
      <p>This policy describes how AP MED handles information through its mentorship platform and participating cohort programs, including Ascenso. Contact us at <a href="mailto:apmedpodcast@gmail.com">apmedpodcast@gmail.com</a> with privacy questions.</p>

      <h2>Information we collect and why</h2>
      <p>We collect information you submit, such as your name, email, school, background, interests, mentorship goals, application answers, profile, availability, meeting information, and program feedback. We use it to process applications, match participants, coordinate meetings, provide program communications, and help authorized administrators manage and evaluate their programs.</p>
      <p>If you sign in with Google, we receive account information needed for authentication. If you choose to connect Google Calendar, we use the authorized calendar access to check availability and manage mentorship calendar events. You can revoke that access through your Google account.</p>
      <p>We also process technical information such as browser and device details, usage events, cookies, and error reports to operate, secure, and improve the service. Authentication uses cookies; configured analytics and monitoring providers may process usage and diagnostic information.</p>

      <h2>Optional text messages</h2>
      <p>Where a program offers SMS enrollment, we collect your mobile number and your separate consent choice. When you opt in, we retain the consent disclosure, its version, and the time of consent. We also process opt-out records, message identifiers and sending status, and eligible check-in replies to operate the messaging program and honor your preferences.</p>
      <p>AP MED texts are meeting reminders and one-question post-meeting check-ins for your cohort. Message frequency varies with bookings: up to two AP MED texts per booked meeting. Message and data rates may apply. SMS consent is optional and is not a condition of participation or purchase. Providing a phone number alone does not authorize text messages.</p>
      <p>Check-in replies are named and visible to authorized program administrators; they are not anonymous. Do not include patient information or other sensitive medical information in replies.</p>
      <p>We do not sell or share mobile numbers or SMS opt-in data and consent with third parties or affiliates for marketing or promotional purposes. SMS opt-in data and consent are not shared with third parties except service providers that process them solely to operate and deliver AP MED messaging, such as our messaging provider Twilio.</p>
      <p>Reply STOP to opt out or HELP for help. You may also contact <a href="mailto:apmedpodcast@gmail.com">apmedpodcast@gmail.com</a>. When SMS preference controls are available in your dashboard, you can revoke consent or remove your number there. Changing your number requires fresh consent. Sending START alone does not renew AP MED consent after STOP; opt in again through the authenticated dashboard. See our <Link href="/terms#sms">SMS terms</Link>.</p>

      <h2>Who can access information</h2>
      <p>Information intended for a public mentor profile is displayed in the mentor directory. Relevant information is used to connect participants, and authorized program administrators can access program applications, participant records, and feedback. Avoid submitting information you do not want used for those purposes.</p>
      <p>Service providers process information needed to provide hosting, database storage, authentication, email, scheduling, security, analytics, and monitoring. Our platform integrations include Vercel, Supabase, Resend, Google, Cloudflare Turnstile, PostHog, and Sentry; Twilio supports SMS when enabled. We may disclose information when required by law or necessary to protect the service and its users.</p>

      <h2>Retention, security, and your choices</h2>
      <p>We retain information as needed to operate programs, maintain records, resolve issues, and meet applicable obligations. Consent and suppression records may need to be retained to document your choices and prevent unwanted texts. We use access controls and other safeguards, but no online service can guarantee absolute security.</p>
      <p>For requests to access, correct, or delete your information, contact <a href="mailto:apmedpodcast@gmail.com">apmedpodcast@gmail.com</a>. We may verify your identity and coordinate with your program administrator. Some records may need to be retained for legal, security, or program recordkeeping reasons. You can control cookies in your browser, although blocking authentication cookies may affect sign-in.</p>

      <h2>Policy updates</h2>
      <p>We will publish changes on this page and update the date above. Questions about this policy or your program data can be sent to our contact email.</p>
    </>
  )
}
