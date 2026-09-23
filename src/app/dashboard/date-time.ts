export function formatDashboardDateTime(
  iso: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' },
): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'

  return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date)
}
