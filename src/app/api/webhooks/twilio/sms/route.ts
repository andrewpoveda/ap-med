export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createTwilioInboundSmsParserFromEnv } from '@/lib/sms/twilio'

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

function emptyTwiml(): Response {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** Twilio authenticates this request with its signature. The database performs
 * receipt deduplication, STOP handling, and check-in attribution atomically. */
export async function POST(request: Request): Promise<Response> {
  const parser = createTwilioInboundSmsParserFromEnv()
  if (!parser) return Response.json({ error: 'SMS webhook unavailable' }, { status: 503 })

  let parsed: Awaited<ReturnType<typeof parser.parseInbound>>
  try {
    parsed = await parser.parseInbound(request)
  } catch {
    return Response.json({ error: 'Invalid SMS webhook' }, { status: 400 })
  }
  if (!parsed.ok) {
    return Response.json({ error: 'Invalid SMS webhook' }, { status: parsed.status })
  }

  try {
    // STOP/START/HELP are recorded even after the global or cohort switch is
    // turned off. A STOP must remain effective if SMS is re-enabled later.
    const { data, error } = await getSupabaseAdmin().rpc('sms_process_inbound', {
      p_provider: 'twilio',
      p_message_id: parsed.event.externalMessageId,
      p_from_phone_e164: parsed.event.fromPhoneE164,
      p_to_phone_e164: parsed.event.toPhoneE164,
      p_body: parsed.event.body,
      p_opt_out_type: parsed.event.optOutType ?? null,
    })
    if (error || !data) {
      console.error('SMS inbound persistence failed', { code: error?.code ?? 'empty_result' })
      return Response.json({ error: 'SMS webhook temporarily unavailable' }, { status: 503 })
    }
    // Twilio's Advanced Opt-Out may have already replied to the sender. An
    // empty TwiML avoids duplicate confirmations and surprise extra messages.
    return emptyTwiml()
  } catch {
    console.error('SMS inbound persistence crashed')
    return Response.json({ error: 'SMS webhook temporarily unavailable' }, { status: 503 })
  }
}
