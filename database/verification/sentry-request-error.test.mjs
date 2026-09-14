import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTs } from './test-support.mjs'

test('Sentry request instrumentation ignores expected Next navigation errors', () => {
  const captured = []
  const { onRequestError } = loadTs('src/instrumentation.ts', {
    '@sentry/nextjs': {
      captureRequestError: (...args) => captured.push(args),
    },
  })
  const request = { method: 'GET', path: '/dashboard', headers: new Headers() }
  const context = { routePath: '/dashboard', routerKind: 'App Router', routeType: 'render' }

  for (const digest of ['NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404', 'NEXT_REDIRECT;push;/login']) {
    onRequestError({ digest }, request, context)
  }

  assert.equal(captured.length, 0)
})

test('Sentry request instrumentation still captures real request errors', () => {
  const captured = []
  const { onRequestError } = loadTs('src/instrumentation.ts', {
    '@sentry/nextjs': {
      captureRequestError: (...args) => captured.push(args),
    },
  })
  const error = new Error('database unavailable')
  const request = { method: 'GET', path: '/dashboard', headers: new Headers() }
  const context = { routePath: '/dashboard', routerKind: 'App Router', routeType: 'render' }

  onRequestError(error, request, context)

  assert.equal(captured.length, 1)
  assert.equal(captured[0][0], error)
  assert.equal(captured[0][1], request)
  assert.equal(captured[0][2], context)
})
