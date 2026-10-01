import type { Metadata } from 'next'
import Link from 'next/link'
import { absoluteUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms of Service | AP MED',
  description: 'Terms for AP MED mentorship services and optional cohort text messages.',
  alternates: { canonical: absoluteUrl('/terms') },
}

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: October 1, 2026</p>
      <p>These terms govern use of the AP MED mentorship platform, including participating cohort programs such as Ascenso. By using the service, you agree to these terms. Our <Link href="/privacy">Privacy Policy</Link> explains how we handle your information.</p>

      <h2>Mentorship services</h2>
      <p>AP MED helps participants find mentors and helps programs coordinate applications, matching, meetings, and feedback. Individual programs may have additional participation requirements. Mentorship is educational and does not constitute medical care, legal advice, or a guarantee of admission, employment, or any particular outcome. Do not use AP MED for emergencies or patient care.</p>

      <h2>Your responsibilities</h2>
      <p>Provide accurate information, use only accounts and phone numbers you are authorized to use, protect your sign-in access, and treat other participants respectfully. Do not harass others, send spam, impersonate another person, attempt unauthorized access, or submit patient information or confidential material you are not authorized to share. We may restrict access for misuse or to protect participants and the service.</p>

      <h2 id="sms">AP MED cohort SMS program</h2>
      <p>When available in your program, you may separately opt in to AP MED text messages about booked mentorship meetings and one-question post-meeting check-ins. SMS enrollment requires an explicit consent choice; a phone number, application submission, or acceptance of these terms alone does not enroll you. Consent is optional and is not a condition of participation or purchase.</p>
      <p>Message frequency varies with your bookings, with up to two AP MED texts per booked meeting. Message and data rates may apply according to your mobile plan. Check-in replies are named and visible to authorized program administrators. Do not include patient information in replies.</p>
      <p>Reply STOP to cancel text messages at any time. You may receive an opt-out confirmation. You can also revoke consent or remove your number using dashboard SMS preferences when available. Opting out of SMS does not close your AP MED account or end your program participation.</p>
      <p>Reply HELP for help, or email <a href="mailto:apmedpodcast@gmail.com">apmedpodcast@gmail.com</a>. After STOP, sending START alone does not renew AP MED consent; you must opt in again through the authenticated dashboard. If you change your number, provide fresh consent for the new number.</p>
      <p>Text messages depend on provider, carrier, and network availability. Delivery and timing are not guaranteed, and carriers are not liable for delayed or undelivered messages. Use your dashboard and program communications to confirm meetings. The <Link href="/privacy">Privacy Policy</Link> describes our handling of mobile numbers, consent records, and replies.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep AP MED reliable, but access may be interrupted for maintenance, outages, or third-party service issues. Features may change or be paused, including SMS. We will publish updated terms here and revise the date above. Contact your program administrator for program-specific participation questions.</p>

      <h2>Contact</h2>
      <p>For service questions, SMS support, or questions about these terms, email <a href="mailto:apmedpodcast@gmail.com">apmedpodcast@gmail.com</a>.</p>
    </>
  )
}
