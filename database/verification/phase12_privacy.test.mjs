import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

test('client server and edge configure privacy hooks with replay and transactions disabled', () => {
  for (const file of ['src/instrumentation-client.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts']) {
    let config
    const privacy = loadTs('src/lib/sentry-privacy.ts')
    loadTs(file, {
      '@sentry/nextjs': { init: options => { config = options }, captureRouterTransitionStart: () => {} },
      './src/lib/sentry-privacy': privacy,
    })
    assert.equal(config.tracesSampleRate, 0)
    assert.equal(config.beforeSendTransaction({}), null)
    assert.equal(config.sendDefaultPii, false)
    assert.equal(config.beforeSend({ type: undefined, message: 'private' }).message, undefined)
    if (file.startsWith('src/')) {
      assert.equal(config.replaysSessionSampleRate, 0)
      assert.equal(config.replaysOnErrorSampleRate, 0)
      assert.equal(config.integrations, undefined)
    }
  }
})

test('Sentry error reports discard personal content and credential-bearing context', () => {
  const { sanitizeSentryEvent } = loadTs('src/lib/sentry-privacy.ts')
  const secret = 'private-person@example.org'
  const cohortId = '7bc979e3-229c-47cc-b814-58c6b304ad44'
  const result = sanitizeSentryEvent({ type: undefined, event_id: 'event', level: 'error',
    environment: 'production', transaction: `/admin/cohorts/${cohortId}/analytics`,
    message: secret, user: { email: secret }, request: { url: `https://example.org/admin/cohorts/${cohortId}/analytics?code=${secret}`, data: { answers: secret } },
    extra: { goals: secret, notes: secret, survey: secret }, breadcrumbs: [{ message: secret }], contexts: { data: { token: secret } },
    exception: { values: [{ type: secret, value: secret, stacktrace: { frames: [
      { filename: `https://example.org/schedule/private-token?email=${secret}#credential`, vars: { secret }, context_line: secret },
      { filename: `https://[invalid/${secret}` },
    ] } }] },
  })
  const serialized = JSON.stringify(result)
  for (const value of [secret, 'private-token', 'credential', 'answers', 'breadcrumbs', 'context_line']) assert.ok(!serialized.includes(value))
  assert.equal(result.event_id, 'event')
  assert.equal(result.environment, 'production')
  assert.equal(result.transaction, '/admin/cohorts/[id]/analytics')
  assert.deepEqual(result.request, { url: 'https://example.org/admin/cohorts/[id]/analytics' })
  assert.equal(result.exception.values[0].stacktrace.frames[0].filename, 'https://example.org/schedule/[token]')
})

test('Sentry diagnostics omit untrusted environment and transaction values', () => {
  const { sanitizeSentryEvent } = loadTs('src/lib/sentry-privacy.ts')
  const result = sanitizeSentryEvent({
    type: undefined,
    environment: 'customer@example.org',
    transaction: 'customer@example.org',
    request: { url: 'customer@example.org' },
  })
  assert.equal(result.environment, undefined)
  assert.equal(result.transaction, undefined)
  assert.equal(result.request, undefined)
})
