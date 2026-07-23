'use client'

import type { CSSProperties } from 'react'

// Screen-only report toolbar for the analytics page (ascenso-prm.md §5.14):
// "Print / Save as PDF" (the one-page board summary — window.print() drives the
// browser's own PDF export, so no server-side PDF dependency) plus a CSV
// download link per cohort table. Carries `.no-print` so none of it appears in
// the printed report. The download links are plain <a download> anchors hitting
// the admin-gated export route — no client JS needed for the download itself.

type ExportLink = { table: string; label: string }

const linkStyle: CSSProperties = {
  color: '#8a6a2f',
  fontSize: '0.85rem',
  border: '1px solid #e8e4dc',
  borderRadius: '999px',
  padding: '0.25rem 0.7rem',
  background: '#fffdf8',
  whiteSpace: 'nowrap',
}

export default function ReportToolbar({
  cohortId,
  exports,
}: {
  cohortId: string
  exports: ExportLink[]
}) {
  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.6rem',
        marginTop: '1.25rem',
        padding: '0.9rem 1rem',
        background: '#faf8f4',
        border: '1px solid #e8e4dc',
        borderRadius: '10px',
      }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          background: '#a8751f',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          padding: '0.45rem 0.9rem',
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Print / Save as PDF
      </button>
      <span className="text-[#6b6b6b]" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
        Download CSV:
      </span>
      {exports.map((e) => (
        <a
          key={e.table}
          href={`/api/admin/cohorts/${cohortId}/export?table=${e.table}`}
          download
          style={linkStyle}
        >
          {e.label}
        </a>
      ))}
    </div>
  )
}
