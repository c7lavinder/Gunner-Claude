// lib/dates.ts
// Central time (America/Chicago) day boundary helpers
// Used everywhere "today" is calculated — KPIs, tasks, milestones, dashboard

const TZ = 'America/Chicago'

/**
 * Returns the UTC offset (in ms) of America/Chicago at the given UTC instant.
 * +5h during CDT (Mar–Nov), +6h during CST (Nov–Mar).
 *
 * Uses Intl.DateTimeFormat.formatToParts to read the wall-clock components
 * a CT observer sees at `instant`, then diffs against the instant. This is
 * host-TZ-independent — earlier versions did
 * `new Date(noon.toLocaleString('en-US', { timeZone: TZ }))`, which built
 * a TZ-naive string and re-parsed it as host-local time, silently producing
 * a wrong offset on any dev machine not running in UTC.
 */
function getCentralOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(instant)
  const get = (k: string) => Number(parts.find(p => p.type === k)!.value)
  // hour12: false can return '24' for midnight on some engines; coerce to 0.
  const hour = get('hour') === 24 ? 0 : get('hour')
  const ctAsIfUtc = Date.UTC(
    get('year'), get('month') - 1, get('day'),
    hour, get('minute'), get('second'),
  )
  return instant.getTime() - ctAsIfUtc
}

/**
 * Get start and end of a day in Central time, returned as UTC Date objects.
 * Defaults to today if no date string is provided.
 * @param dateStr Optional 'YYYY-MM-DD' string. If omitted, uses today in Central time.
 */
export function getCentralDayBounds(dateStr?: string): { dayStart: Date; dayEnd: Date } {
  const centralDate = dateStr ?? new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
  // Probe at noon UTC of `centralDate` — far enough from CT midnight that
  // the offset is unambiguous even on DST transition days.
  const probe = new Date(`${centralDate}T12:00:00Z`)
  const offsetMs = getCentralOffsetMs(probe)
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
