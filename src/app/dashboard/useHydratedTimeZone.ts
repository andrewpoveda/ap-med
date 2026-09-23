'use client'

import { useEffect, useState } from 'react'

/**
 * Client Components are also rendered on the server. Use UTC for that first
 * render, then switch to the browser's zone after hydration so the server and
 * browser produce identical initial markup.
 */
export default function useHydratedTimeZone(): string {
  const [timeZone, setTimeZone] = useState('UTC')

  useEffect(() => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (browserTimeZone) setTimeZone(browserTimeZone)
  }, [])

  return timeZone
}
