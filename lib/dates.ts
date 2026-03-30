// lib/dates.ts
// Central time (America/Chicago) day boundary helpers
// Used everywhere "today" is calculated — KPIs, tasks, milestones, dashboard

const TZ = 'America/Chicago'

/**
 * Get start and end of a day in Central time, returned as UTC Date objects.
 * Defaults to today if no date string is provided.
 * @param dateStr Optional 'YYYY-MM-DD' string. If omitted, uses today in Central time.
 */
export function getCentralDayBounds(dateStr?: string): { dayStart: Date; dayEnd: Date } {
  const centralDate = dateStr ?? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())

  // Calculate the UTC offset for Central time on this date
  const noon = new Date(`${centralDate}T12:00:00Z`)
  const centralNoon = new Date(noon.toLocaleString('en-US', { timeZone: TZ }))
  const offsetMs = noon.getTime() - centralNoon.getTime()

  const dayStart = new Date(`${centralDate}T00:00:00Z`)
  dayStart.setTime(dayStart.getTime() + offsetMs)

  const dayEnd = new Date(`${centralDate}T23:59:59.999Z`)
  dayEnd.setTime(dayEnd.getTime() + offsetMs)

  return { dayStart, dayEnd }
}

/**
 * Get today's date string in Central time ('YYYY-MM-DD')
 */
export function getCentralToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
}
