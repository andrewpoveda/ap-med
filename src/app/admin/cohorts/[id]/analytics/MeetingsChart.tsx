'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { MonthlyMeetings } from '@/lib/cohort-analytics'

// Meetings logged per month across the cohort (ascenso-prm.md §5.13, the "per
// month" projection of "meetings logged per pair per month"; the per-pair
// projection is the table beside this). Single series — no legend, the card
// title names it. Validated deep-amber (#a8751f) bar on the white card surface:
// passes the dataviz lightness/chroma/contrast checks, and every bar carries a
// direct value label so the count is never color-alone. Light theme only — the
// site deliberately has no dark mode.

const BAR_COLOR = '#a8751f'
const AXIS_TEXT = '#6b6b6b'
const LABEL_TEXT = '#4a4a5a'
const GRID = '#f0ede6'

type TooltipPayload = { payload: MonthlyMeetings; value: number }

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const { count, month } = payload[0].payload
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e8e4dc',
        borderRadius: '8px',
        padding: '0.5rem 0.7rem',
        boxShadow: '0 2px 8px rgba(26,26,46,0.08)',
        fontSize: '0.82rem',
        color: '#1a1a2e',
      }}
    >
      <div style={{ fontWeight: 600 }}>{month}</div>
      <div style={{ color: LABEL_TEXT }}>
        {count} {count === 1 ? 'meeting' : 'meetings'} logged
      </div>
    </div>
  )
}

export default function MeetingsChart({ data }: { data: MonthlyMeetings[] }) {
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: '#e8e4dc' }}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: AXIS_TEXT, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'rgba(168,117,31,0.08)' }}
          />
          <Bar dataKey="count" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48}>
            <LabelList
              dataKey="count"
              position="top"
              style={{ fill: LABEL_TEXT, fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
