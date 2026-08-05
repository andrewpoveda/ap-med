'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'

/**
 * Current / previous switch for a resubmitted application (migration 0007).
 *
 * The current answers are the primary view and the default tab — they're what
 * the board is deciding on. The superseded version sits behind its own tab
 * rather than inline or diffed, because the two are separate accounts of the
 * same person and interleaving them makes both harder to read.
 *
 * Both panels are rendered on the server and passed in as children, so this
 * client component holds nothing but the selected tab.
 */
export default function SubmissionTabs({
  current,
  previous,
  previousLabel,
}: {
  current: ReactNode
  previous: ReactNode
  /** e.g. "Previous · submitted Mar 3, 2026" */
  previousLabel: string
}) {
  const [tab, setTab] = useState<'current' | 'previous'>('current')

  const tabStyle = (active: boolean): CSSProperties => ({
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid ${active ? '#c8a96e' : 'transparent'}`,
    color: active ? '#1a1a2e' : '#6b6b6b',
    padding: '0.5rem 0.15rem',
    marginRight: '1.5rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: active ? 'default' : 'pointer',
  })

  return (
    <div>
      <div
        role="tablist"
        aria-label="Application versions"
        style={{ borderBottom: '1px solid #e8e4dc', marginBottom: '1.5rem' }}
      >
        <button
          type="button"
          role="tab"
          id="tab-current"
          aria-selected={tab === 'current'}
          aria-controls="panel-current"
          onClick={() => setTab('current')}
          style={tabStyle(tab === 'current')}
        >
          Current
        </button>
        <button
          type="button"
          role="tab"
          id="tab-previous"
          aria-selected={tab === 'previous'}
          aria-controls="panel-previous"
          onClick={() => setTab('previous')}
          style={tabStyle(tab === 'previous')}
        >
          {previousLabel}
        </button>
      </div>

      {/*
        Both panels stay mounted and the inactive one is hidden, so Cmd-F finds
        text in either version — a reviewer looking for something they half
        remember shouldn't have to guess which tab it was on.
      */}
      <div role="tabpanel" id="panel-current" aria-labelledby="tab-current" hidden={tab !== 'current'}>
        {current}
      </div>
      <div
        role="tabpanel"
        id="panel-previous"
        aria-labelledby="tab-previous"
        hidden={tab !== 'previous'}
      >
        {previous}
      </div>
    </div>
  )
}
