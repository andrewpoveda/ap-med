'use client'

import { formatDashboardDateTime } from './date-time'
import useHydratedTimeZone from './useHydratedTimeZone'

export default function LocalDateTime({ iso }: { iso: string }) {
  const timeZone = useHydratedTimeZone()

  return (
    <time dateTime={iso}>
      {formatDashboardDateTime(iso, timeZone)}
    </time>
  )
}
