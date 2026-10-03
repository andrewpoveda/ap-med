import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInThisContext } from 'node:vm'
import React from 'react'
import { renderToString } from 'react-dom/server'
import ts from 'typescript'

// Render the real component; only its router and presentation-only styles are
// replaced. This needs no browser package, provider credentials, or network.
const filename = fileURLToPath(new URL('../../src/app/admin/AscensoVisibilityToggle.tsx', import.meta.url))
const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
})
const nodeRequire = createRequire(import.meta.url)
const componentModule = { exports: {} }
const require = name => {
  if (name === 'next/navigation') return { useRouter: () => ({ refresh() {} }) }
  if (name === '@/components/styles') return { cardStyle: {} }
  return nodeRequire(name)
}
runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(require, componentModule, componentModule.exports)
const AscensoVisibilityToggle = componentModule.exports.default

function renderInTimezone(timezone, updatedAt) {
  const previous = process.env.TZ
  try {
    process.env.TZ = timezone
    return renderToString(React.createElement(AscensoVisibilityToggle, {
      initialVisible: true,
      initialUpdatedAt: updatedAt,
      readError: null,
    }))
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

for (const [updatedAt, expected] of [
  ['2026-09-12T15:00:00Z', 'Sep 12, 2026, 3:00 PM UTC'],
  ['2026-03-08T07:30:00Z', 'Mar 8, 2026, 7:30 AM UTC'],
  ['2026-11-01T05:30:00Z', 'Nov 1, 2026, 5:30 AM UTC'],
]) {
  test(`visibility timestamp has identical initial HTML across timezones: ${updatedAt}`, () => {
    const serverHtml = renderInTimezone('UTC', updatedAt)
    for (const browserTimezone of ['America/New_York', 'America/Los_Angeles', 'Asia/Tokyo']) {
      assert.equal(renderInTimezone(browserTimezone, updatedAt), serverHtml,
        `Initial render in ${browserTimezone} must match the UTC server for hydration`)
    }
    assert.ok(serverHtml.includes(expected), 'The timestamp must identify UTC explicitly')
  })
}

// A fixed timezone does not fix differences between Node and browser locale
// data. Exercise the real component with divergent Intl-backed date output.
test('visibility timestamp has identical initial HTML across locale implementations', () => {
  const updatedAt = '2026-09-12T15:00:00Z'
  const serverHtml = renderInTimezone('UTC', updatedAt)
  const original = Date.prototype.toLocaleString
  try {
    Date.prototype.toLocaleString = () => 'Sep 12, 2026, 3:00\u202fPM UTC'
    assert.equal(renderInTimezone('America/New_York', updatedAt), serverHtml)
  } finally {
    Date.prototype.toLocaleString = original
  }
})

for (const [updatedAt, expected] of [
  ['2026-01-01T00:05:00Z', 'Jan 1, 2026, 12:05 AM UTC'],
  ['2026-12-31T12:00:00Z', 'Dec 31, 2026, 12:00 PM UTC'],
  ['2026-10-01T23:05:00-04:00', 'Oct 2, 2026, 3:05 AM UTC'],
  ['invalid', 'Unknown time'],
]) {
  test(`visibility timestamp formats UTC boundaries safely: ${updatedAt}`, () => {
    assert.ok(renderInTimezone('UTC', updatedAt).includes(expected))
  })
}
