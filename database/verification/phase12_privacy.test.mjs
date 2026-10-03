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

test('Sentry separates safe error identities without retaining local paths or private messages', () => {
  const { sanitizeSentryEvent } = loadTs('src/lib/sentry-privacy.ts')
  const first = sanitizeSentryEvent({
    transaction: '/admin',
    exception: { values: [{ type: 'Error', value: 'Could not load complete application counts', stacktrace: { frames: [
      { filename: 'file:///Users/private-user/site/.next/server/app/admin/page.js?token=secret', lineno: 42 },
    ] } }] },
  })
  const second = sanitizeSentryEvent({
    transaction: '/dashboard',
    exception: { values: [{ type: 'Error', value: 'private-person@example.org', stacktrace: { frames: [
      { filename: '/Users/private-user/site/other.js', lineno: 1 },
      { filename: 'file:///var/task/.next/server/app/dashboard/page.js', lineno: 10 },
    ] } }] },
  })
  assert.deepEqual(first.fingerprint, ['ap-med-error', '/admin', 'admin-application-counts'])
  assert.deepEqual(second.fingerprint, ['ap-med-error', '/dashboard', '/.next/server/app/dashboard/page.js:10'])
  assert.equal(first.exception.values[0].stacktrace.frames[0].filename, '/.next/server/app/admin/page.js')
  assert.equal(second.exception.values[0].stacktrace.frames[0].filename, undefined)
  assert.ok(!JSON.stringify([first, second]).includes('private-user'))
  assert.ok(!JSON.stringify([first, second]).includes('private-person@example.org'))
  assert.ok(!JSON.stringify([first, second]).includes('secret'))
  const digestEvent = sanitizeSentryEvent({ transaction: '/admin', fingerprint: ['next-server-render', '123456789'],
    exception: { values: [{ type: 'Error', value: 'private-person@example.org' }] } })
  const unsafeFingerprint = sanitizeSentryEvent({ transaction: '/admin', fingerprint: ['next-server-render', 'private-person@example.org'],
    exception: { values: [{ type: 'Error', value: 'private-person@example.org' }] } })
  assert.deepEqual(digestEvent.fingerprint, ['ap-med-error', '/admin', 'next-digest:123456789'])
  assert.deepEqual(unsafeFingerprint.fingerprint, ['ap-med-error', '/admin', 'unknown-error'])
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

test('Sentry keeps normalized Next build frames and their distinct error identities', () => {
  const { sanitizeSentryEvent } = loadTs('src/lib/sentry-privacy.ts')
  // Next's default SDK integrations rewrite browser and server build paths to
  // app:///_next before beforeSend runs; these are the resulting frame shapes.
  const filenames = [
    'app:///_next/static/chunks/0lku3m_liqdxj.js',
    'app:///_next/static/chunks/16d21q~qvpm7d.js',
    'app:///_next/server/app/admin/page.js',
    'app:///_next/server/app/admin/cohorts/[id]/page.js',
  ]
  const fingerprints = []
  for (const filename of filenames) {
    const result = sanitizeSentryEvent({
      transaction: '/admin',
      exception: { values: [{ type: 'Error', value: 'private-person@example.org', stacktrace: { frames: [
        { filename: `${filename}?token=private-token#private-fragment`, lineno: 20, colno: 197375 },
      ] } }] },
    })
    assert.deepEqual(result.exception.values[0].stacktrace.frames[0], { filename, lineno: 20, colno: 197375 })
    assert.deepEqual(result.fingerprint, ['ap-med-error', '/admin', `${filename}:20`])
    for (const secret of ['private-person@example.org', 'private-token', 'private-fragment']) {
      assert.ok(!JSON.stringify(result).includes(secret))
    }
    fingerprints.push(result.fingerprint[2])
  }
  assert.equal(new Set(fingerprints).size, filenames.length)
})

test('Sentry rejects untrusted app URLs instead of treating them as build frames', () => {
  const { sanitizeSentryEvent } = loadTs('src/lib/sentry-privacy.ts')
  const filenames = [
    'app://private-person:password@host/_next/static/chunks/main.js',
    'app:///_next/../src/private-file.js',
    'app:///_next/static/chunks/../private-file.js',
    'app:///_next/static/chunks/./main.js',
    'app:///_next/static/chunks//main.js',
    'app:///_next/static/chunks/%2e%2e/private-file.js',
    'app:///_next/static/chunks/private-person@example.org.js',
    'app:///_next/static/chunks/private%40example.org.js',
    'app:///_next/static/chunks/main.js.map',
    'app:///_next/static/chunks/main.css',
    'app:///_next/private-file.js',
    'app:///src/private-file.js',
    'app:///_next-other/static/chunks/main.js',
    `app:///_next/static/chunks/${'a'.repeat(240)}.js`,
    String.raw`app:///_next/static/chunks/..\private-file.js`,
  ]
  for (const filename of filenames) {
    const result = sanitizeSentryEvent({ transaction: '/admin', exception: { values: [
      { type: 'Error', stacktrace: { frames: [{ filename, lineno: 1 }] } },
    ] } })
    assert.equal(result.exception.values[0].stacktrace.frames[0].filename, undefined, filename)
    assert.deepEqual(result.fingerprint, ['ap-med-error', '/admin', 'unknown-error'], filename)
  }
})
