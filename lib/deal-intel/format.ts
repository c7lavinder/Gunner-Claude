// lib/deal-intel/format.ts
// Shared rendering helpers for deal intelligence values. Used by both the
// property detail page (snapshot view) and the call detail page (proposed
// changes review). Centralizing here so object formatting + blank-placeholder
// filtering behave identically in both places.

import { format } from 'date-fns'

// ── Blank placeholders ─────────────────────────────────────────────────────
// Strings the AI emits when it has no real data. We render these as empty
// rather than as literal "not discussed" / "unknown" text.
export const BLANK_PLACEHOLDERS: ReadonlySet<string> = new Set([
  'unknown',
  'unknown - not discussed',
  'not discussed',
  'not mentioned',
  'not stated',
  'not specified',
  'n/a',
  'none',
  'null',
  'undefined',
  '-',
  '—',
  '',
])

export function isBlankString(s: string): boolean {
  return BLANK_PLACEHOLDERS.has(s.toLowerCase().trim())
}

export function isBlankValue(val: unknown): boolean {
  if (val === null || val === undefined) return true
  if (typeof val === 'string') return isBlankString(val)
  if (Array.isArray(val)) return val.every(isBlankValue)
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    // FieldValue wrapper
    if ('value' in obj) return isBlankValue(obj.value)
    // AccumulatedField wrapper
    if ('items' in obj) return !Array.isArray(obj.items) || obj.items.every(isBlankValue)
    // Plain object — blank if all non-metadata entries are blank
    const meaningful = Object.entries(obj).filter(
      ([k]) => !['_addedAt', '_sourceCallId', 'sourceCallId', 'updatedAt', 'confidence', 'callId'].includes(k),
    )
    if (meaningful.length === 0) return true
    return meaningful.every(([, v]) => isBlankValue(v))
  }
  return false
}

// ── Single-item formatter ──────────────────────────────────────────────────
// Formats one element (scalar, object) to human-readable text. Object
// formatting is field-aware so e.g. { objection, whatWorked } reads naturally.

const METADATA_KEYS = new Set([
  '_addedAt', '_sourceCallId', 'sourceCallId', 'updatedAt', 'confidence', 'callId',
])

// Keys whose value should lead the formatted string (the "main" value of the object).
const LEAD_KEYS = new Set([
  'objection', 'what', 'event', 'name', 'phrase', 'item',
  'info', 'moment', 'action', 'commitment', 'promise',
])

export function formatSingleItem(item: unknown): string {
  if (item === null || item === undefined) return ''

  if (typeof item === 'string') {
    return isBlankString(item) ? '' : item
  }

  if (typeof item === 'number' || typeof item === 'boolean') return String(item)

  if (Array.isArray(item)) {
    return item.map(formatSingleItem).filter(Boolean).join(', ')
  }

  if (typeof item === 'object') {
    const obj = item as Record<string, unknown>

    // Unwrap FieldValue
    if ('value' in obj && !('items' in obj)) {
      return formatSingleItem(obj.value)
    }
    // Unwrap AccumulatedField
    if ('items' in obj && Array.isArray(obj.items)) {
      return (obj.items as unknown[]).map(formatSingleItem).filter(Boolean).join(', ')
    }

    // Structured timeline shape: { label, window?, humanLabel? }
    if ('label' in obj && ('window' in obj || 'humanLabel' in obj)) {
      const label = String(obj.label ?? '').trim()
      const humanLabel = typeof obj.humanLabel === 'string' ? obj.humanLabel : ''
      const win = obj.window as { start?: string; end?: string } | undefined
      const winStr = win?.start && win?.end
        ? `${formatShortDate(win.start)}–${formatShortDate(win.end)}`
        : win?.start ? formatShortDate(win.start) : ''
      const tail = humanLabel || winStr
      return tail ? `${label} (${tail})` : label
    }

    const lead: string[] = []
    const tail: string[] = []

    for (const [k, v] of Object.entries(obj)) {
      if (METADATA_KEYS.has(k)) continue
      if (v === null || v === undefined) continue
      const sv = typeof v === 'object' ? formatSingleItem(v) : String(v)
      if (!sv || isBlankString(sv)) continue

      if (LEAD_KEYS.has(k)) {
        lead.push(capitalizeFirst(sv))
      } else if (k === 'whatWorked' && sv) {
        tail.push(`worked: ${sv}`)
      } else if (k === 'whatDidntWork' && sv) {
        tail.push(`didn't work: ${sv}`)
      } else if (k === 'effectivenessRating' && sv) {
        tail.push(`(${sv})`)
      } else if (k === 'amount' && sv) {
        tail.push(`$${Number(sv).toLocaleString()}`)
      } else if (k === 'when' && sv) {
        tail.push(formatShortDate(sv))
      } else if (k === 'dueDate' && sv) {
        tail.push(`due ${formatShortDate(sv)}`)
      } else if (k === 'date' && sv) {
        tail.push(formatShortDate(sv))
      } else if (k === 'volunteered') {
        tail.push(v === true ? 'volunteered' : 'extracted')
      } else if (k === 'severity') {
        tail.push(`[${sv}]`)
      } else if (k === 'estimatedCost' && sv) {
        tail.push(`~$${Number(sv).toLocaleString()}`)
      } else if (k === 'urgency' && sv) {
        tail.push(`urgency: ${sv}`)
      } else {
        tail.push(`${humanizeKey(k)}: ${sv}`)
      }
    }

    return [...lead, ...tail].join(' · ')
  }

  return String(item)
}

// ── Top-level value formatter ──────────────────────────────────────────────
// Returns a structured shape so callers can decide: render as a single line,
// or render as multiple bubbles. `items` is populated when the value is a
// meaningful collection.

export interface FormattedValue {
  kind: 'empty' | 'single' | 'list'
  text: string
  items: string[]
  raw: unknown
}

export function formatDealIntelValue(val: unknown): FormattedValue {
  if (isBlankValue(val)) {
    return { kind: 'empty', text: '', items: [], raw: val }
  }

  // Unwrap FieldValue
  if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>) && !('items' in (val as Record<string, unknown>))) {
    return formatDealIntelValue((val as { value: unknown }).value)
  }

  // Unwrap AccumulatedField
  if (val && typeof val === 'object' && 'items' in (val as Record<string, unknown>)) {
    const items = ((val as { items: unknown[] }).items ?? [])
      .map(formatSingleItem)
      .filter(Boolean)
    return { kind: 'list', text: items.join(', '), items, raw: val }
  }

  if (Array.isArray(val)) {
    const items = val.map(formatSingleItem).filter(Boolean)
    if (items.length === 0) return { kind: 'empty', text: '', items: [], raw: val }
    return { kind: 'list', text: items.join(', '), items, raw: val }
  }

  const text = formatSingleItem(val)
  if (!text) return { kind: 'empty', text: '', items: [], raw: val }
  return { kind: 'single', text, items: [text], raw: val }
}

// ── String utilities ───────────────────────────────────────────────────────

export function capitalizeFirst(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function humanizeKey(k: string): string {
  return k
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase())
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return format(d, 'MMM d, yyyy')
  } catch {
    return iso
  }
}

// ── Relative timeline resolution ───────────────────────────────────────────
// Render-time fallback for old calls where the AI emitted a string like
// "3-6 months" instead of the structured { label, window, humanLabel } shape.
// Parses common wholesaling seller timeline expressions and returns a resolved
// window anchored to `anchor` (default = today).

export interface ResolvedTimeline {
  label: string
  window: { start: Date; end: Date }
  humanLabel: string
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december']

function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d); x.setMonth(x.getMonth() + n); return x
}

function seasonRange(season: string, year: number): { start: Date; end: Date } | null {
  const s = season.toLowerCase()
  if (s.includes('spring')) return { start: new Date(year, 2, 1), end: new Date(year, 4, 31) }
  if (s.includes('summer')) return { start: new Date(year, 5, 1), end: new Date(year, 7, 31) }
  if (s.includes('fall') || s.includes('autumn')) return { start: new Date(year, 8, 1), end: new Date(year, 10, 30) }
  if (s.includes('winter')) return { start: new Date(year, 11, 1), end: new Date(year + 1, 1, 28) }
  return null
}

function humanizeWindow(win: { start: Date; end: Date }): string {
  const sameYear = win.start.getFullYear() === win.end.getFullYear()
  const sameMonth = sameYear && win.start.getMonth() === win.end.getMonth()
  if (sameMonth) return format(win.start, 'MMM yyyy')
  if (sameYear) return `${format(win.start, 'MMM')}–${format(win.end, 'MMM yyyy')}`
  return `${format(win.start, 'MMM yyyy')}–${format(win.end, 'MMM yyyy')}`
}

export function resolveRelativeTimeline(raw: string, anchor: Date = new Date()): ResolvedTimeline | null {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.toLowerCase().trim()
  if (isBlankString(s)) return null

  // ASAP / immediately → next 2 weeks
  if (/\b(asap|immediately|right away|urgent)\b/.test(s)) {
    const win = { start: anchor, end: addDays(anchor, 14) }
    return { label: raw, window: win, humanLabel: `by ${format(win.end, 'MMM d, yyyy')}` }
  }

  // "N-M months" or "N to M months"
  const monthRange = s.match(/(\d+)\s*[-–to]+\s*(\d+)\s*months?/)
  if (monthRange) {
    const [, a, b] = monthRange
    const win = { start: addMonths(anchor, Number(a)), end: addMonths(anchor, Number(b)) }
    return { label: raw, window: win, humanLabel: humanizeWindow(win) }
  }

  // "N months" / "N month"
  const singleMonth = s.match(/(\d+)\s*months?$/) || s.match(/^(\d+)\s*months?/)
  if (singleMonth) {
    const n = Number(singleMonth[1])
    const win = { start: addMonths(anchor, Math.max(0, n - 1)), end: addMonths(anchor, n) }
    return { label: raw, window: win, humanLabel: humanizeWindow(win) }
  }

  // "N-M weeks"
  const weekRange = s.match(/(\d+)\s*[-–to]+\s*(\d+)\s*weeks?/)
  if (weekRange) {
    const [, a, b] = weekRange
    const win = { start: addDays(anchor, Number(a) * 7), end: addDays(anchor, Number(b) * 7) }
    return { label: raw, window: win, humanLabel: humanizeWindow(win) }
  }

  // "N weeks"
  const singleWeek = s.match(/(\d+)\s*weeks?/)
  if (singleWeek) {
    const n = Number(singleWeek[1])
    const win = { start: anchor, end: addDays(anchor, n * 7) }
    return { label: raw, window: win, humanLabel: `by ${format(win.end, 'MMM d, yyyy')}` }
  }

  // "end of year" / "by year end" / "end of 2026"
  const eoyMatch = s.match(/end of (?:the\s+)?year|by year[\s-]?end|eoy|end of (\d{4})/)
  if (eoyMatch) {
    const year = eoyMatch[1] ? Number(eoyMatch[1]) : anchor.getFullYear()
    const win = { start: new Date(year, 9, 1), end: new Date(year, 11, 31) }
    return { label: raw, window: win, humanLabel: `Q4 ${year}` }
  }

  // "next year"
  if (/\bnext year\b/.test(s)) {
    const year = anchor.getFullYear() + 1
    const win = { start: new Date(year, 0, 1), end: new Date(year, 11, 31) }
    return { label: raw, window: win, humanLabel: String(year) }
  }

  // "end of month" / "this month"
  if (/\bend of (?:the\s+)?month\b/.test(s)) {
    const win = { start: anchor, end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0) }
    return { label: raw, window: win, humanLabel: `by ${format(win.end, 'MMM d, yyyy')}` }
  }
  if (/\bthis month\b/.test(s)) {
    const win = { start: anchor, end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0) }
    return { label: raw, window: win, humanLabel: format(anchor, 'MMMM yyyy') }
  }
  if (/\bnext month\b/.test(s)) {
    const start = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0)
    return { label: raw, window: { start, end }, humanLabel: format(start, 'MMMM yyyy') }
  }

  // Seasonal: "late summer 2026", "spring", "early fall next year"
  const seasonMatch = s.match(/(early|mid|late)?\s*(spring|summer|fall|autumn|winter)(?:\s+(\d{4}))?/)
  if (seasonMatch) {
    const [, modifier, season, yearStr] = seasonMatch
    const year = yearStr ? Number(yearStr) : anchor.getFullYear()
    const base = seasonRange(season, year)
    if (base) {
      let win = base
      if (modifier === 'early') {
        win = { start: base.start, end: new Date(base.start.getFullYear(), base.start.getMonth() + 1, 0) }
      } else if (modifier === 'late') {
        win = { start: new Date(base.end.getFullYear(), base.end.getMonth(), 1), end: base.end }
      }
      const human = modifier ? `${modifier} ${season} ${year}` : `${season} ${year}`
      return { label: raw, window: win, humanLabel: human.replace(/^\w/, c => c.toUpperCase()) }
    }
  }

  // "after tax season" → mid-April onward
  if (/after tax season/.test(s)) {
    const year = anchor.getMonth() >= 3 ? anchor.getFullYear() + 1 : anchor.getFullYear()
    const win = { start: new Date(year, 3, 15), end: new Date(year, 5, 30) }
    return { label: raw, window: win, humanLabel: `after Apr 15, ${year}` }
  }

  // "after the holidays" → January of next year if we're past Nov
  if (/after the holidays?/.test(s)) {
    const year = anchor.getMonth() >= 10 ? anchor.getFullYear() + 1 : anchor.getFullYear()
    const win = { start: new Date(year, 0, 2), end: new Date(year, 1, 15) }
    return { label: raw, window: win, humanLabel: `Jan–mid Feb ${year}` }
  }

  // Explicit month name: "in June", "June 2026"
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const name = MONTH_NAMES[i]
    const abbr = name.slice(0, 3)
    const re = new RegExp(`\\b${name}|${abbr}\\b(?:\\s+(\\d{4}))?`)
    const m = s.match(re)
    if (m) {
      const year = m[1] ? Number(m[1]) : (i < anchor.getMonth() ? anchor.getFullYear() + 1 : anchor.getFullYear())
      const win = { start: new Date(year, i, 1), end: new Date(year, i + 1, 0) }
      return { label: raw, window: win, humanLabel: format(win.start, 'MMMM yyyy') }
    }
  }

  return null
}

// Fields whose values should get timeline resolution applied at render time.
export const TIME_RELATIVE_FIELDS: ReadonlySet<string> = new Set([
  'sellerTimeline',
  'sellerTimelineUrgency',
  'timelineUrgency',
  'promiseDeadlines',
  'nextStepAgreed',
  'triggerEvents',
  'commitmentsWeMade',
  'promisesTheyMade',
])

export function isTimeRelativeField(field: string): boolean {
  if (TIME_RELATIVE_FIELDS.has(field)) return true
  const lower = field.toLowerCase()
  return lower.includes('timeline') || lower.includes('deadline') || lower.includes('due')
}
