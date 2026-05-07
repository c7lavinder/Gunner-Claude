#!/usr/bin/env -S npx tsx
// scripts/test-parser-edge-cases.ts
// Throwaway. Tests every shape the owner has flagged for the parser
// to handle correctly. Run before/after parser edits to verify no
// regressions.

import { parsePropertyAddress } from '../lib/address-parse'

interface TestCase {
  label: string
  in: { addr: string; city: string | null; state: string | null; zip: string | null }
  expectPrimary: { street: string; city: string; state: string; zip: string }
  expectSplits?: Array<{ street: string; city: string; state: string; zip: string }>
}

const cases: TestCase[] = [
  // ── Patterns the parser already handles (regression fence) ─────────────
  {
    label: 'A1 — apt + zip-in-street',
    in: { addr: '914 N Austin Blvd Apt C8, Oak Park, Il 60302', city: null, state: 'IL', zip: null },
    expectPrimary: { street: '914 N Austin Blvd Apt C8', city: 'Oak Park', state: 'IL', zip: '60302' },
  },
  {
    label: 'M1 — Mundelein zip-in-state',
    in: { addr: '217 N Lakeshore Dr', city: 'Mundelein', state: 'IL 60060', zip: null },
    expectPrimary: { street: '217 N Lakeshore Dr', city: 'Mundelein', state: 'IL', zip: '60060' },
  },
  {
    label: 'C2 — & split, full streets each side',
    in: { addr: '2917 N Custer Rd & 2923 N Custer Rd', city: 'Monroe', state: 'MI', zip: '48162' },
    expectPrimary: { street: '2917 N Custer Rd', city: 'Monroe', state: 'MI', zip: '48162' },
    expectSplits: [{ street: '2923 N Custer Rd', city: 'Monroe', state: 'MI', zip: '48162' }],
  },

  // ── New shapes the parser must learn ───────────────────────────────────
  {
    label: 'NEW-1 — city with embedded ",, " (double comma)',
    in: { addr: '3991 Dickerson Pike', city: 'Nashville,,', state: 'TN', zip: '37207' },
    expectPrimary: { street: '3991 Dickerson Pike', city: 'Nashville', state: 'TN', zip: '37207' },
  },
  {
    label: 'NEW-2 — city with appended state + zip',
    in: { addr: '2027 Spruce St', city: 'Indianapolis, In 46203, IN 46203', state: null, zip: null },
    expectPrimary: { street: '2027 Spruce St', city: 'Indianapolis', state: 'IN', zip: '46203' },
  },
  {
    label: 'NEW-3 — full Pattern-A redundant where structured fields are also set',
    in: { addr: '1723 Whitney Dr Hanover Park, Il 60133', city: 'Hanover Park', state: 'IL', zip: '60133' },
    expectPrimary: { street: '1723 Whitney Dr', city: 'Hanover Park', state: 'IL', zip: '60133' },
  },
  {
    label: 'NEW-4 — apt unit list "Apt R6, D2, & G2"',
    in: { addr: '320 Welch Rd Apt R6, D2, & G2', city: 'Nashville', state: 'TN', zip: '37211' },
    expectPrimary: { street: '320 Welch Rd Apt R6', city: 'Nashville', state: 'TN', zip: '37211' },
    expectSplits: [
      { street: '320 Welch Rd Apt D2', city: 'Nashville', state: 'TN', zip: '37211' },
      { street: '320 Welch Rd Apt G2', city: 'Nashville', state: 'TN', zip: '37211' },
    ],
  },
  {
    label: 'NEW-5 — "///" separator with per-segment city/state/zip',
    in: {
      addr: '700 Fowler St Old Hickory, Tn 37138 /// 809 E Old Hickory Blvd Madison, Tn 37115',
      city: 'Nashville', state: 'TN', zip: '37138',
    },
    expectPrimary: { street: '700 Fowler St', city: 'Old Hickory', state: 'TN', zip: '37138' },
    expectSplits: [{ street: '809 E Old Hickory Blvd', city: 'Madison', state: 'TN', zip: '37115' }],
  },
  {
    label: 'NEW-6 — space-jammed two streets + cities joined by "&"',
    in: { addr: '2025 Rose St 36580 Bismark St', city: 'Carleton & New Boston', state: 'MI', zip: '48117' },
    expectPrimary: { street: '2025 Rose St', city: 'Carleton', state: 'MI', zip: '48117' },
    expectSplits: [{ street: '36580 Bismark St', city: 'New Boston', state: 'MI', zip: '48117' }],
  },
  {
    label: 'NEW-7 — slash separator at start ("802/810 Butler Rd")',
    in: { addr: '802/810 Butler Rd', city: 'Portland', state: 'TN', zip: '37148' },
    expectPrimary: { street: '802 Butler Rd', city: 'Portland', state: 'TN', zip: '37148' },
    expectSplits: [{ street: '810 Butler Rd', city: 'Portland', state: 'TN', zip: '37148' }],
  },
  {
    label: 'NEW-8 — slash separator with single digits ("9/11 Brown Ave")',
    in: { addr: '9/11 Brown Ave', city: 'Amesbury', state: 'MA', zip: '01913' },
    expectPrimary: { street: '9 Brown Ave', city: 'Amesbury', state: 'MA', zip: '01913' },
    expectSplits: [{ street: '11 Brown Ave', city: 'Amesbury', state: 'MA', zip: '01913' }],
  },
  {
    label: 'NEW-9 — fractional address NOT split ("310 1/2 Carpenter St")',
    in: { addr: '310 1/2 Carpenter St', city: 'Mount Pleasant', state: 'TN', zip: '38474' },
    expectPrimary: { street: '310 1/2 Carpenter St', city: 'Mount Pleasant', state: 'TN', zip: '38474' },
  },
  {
    label: 'NEW-10 — comma-only apt unit list ("Apt B11, F6")',
    in: { addr: '370 Wallace Rd Apt B11, F6', city: 'Nashville', state: 'TN', zip: '37211' },
    expectPrimary: { street: '370 Wallace Rd Apt B11', city: 'Nashville', state: 'TN', zip: '37211' },
    expectSplits: [{ street: '370 Wallace Rd Apt F6', city: 'Nashville', state: 'TN', zip: '37211' }],
  },
  {
    label: 'NEW-11 — "and" separator ("217 And 219 Dunnaway St")',
    in: { addr: '217 And 219 Dunnaway St', city: 'Shelbyville', state: 'TN', zip: '37160' },
    expectPrimary: { street: '217 Dunnaway St', city: 'Shelbyville', state: 'TN', zip: '37160' },
    expectSplits: [{ street: '219 Dunnaway St', city: 'Shelbyville', state: 'TN', zip: '37160' }],
  },
  {
    label: 'NEW-12 — space-jammed twin streets, same name',
    in: { addr: '1803 S Westmoreland Dr 1811 S Westmoreland Dr', city: 'Orlando', state: 'FL', zip: '32805' },
    expectPrimary: { street: '1803 S Westmoreland Dr', city: 'Orlando', state: 'FL', zip: '32805' },
    expectSplits: [{ street: '1811 S Westmoreland Dr', city: 'Orlando', state: 'FL', zip: '32805' }],
  },
  {
    label: 'NEW-13 — space-jammed twin streets, different names',
    in: { addr: '4306 Spann Ave 1912 S Emerson Ave', city: 'Indianapolis', state: 'IN', zip: '46203' },
    expectPrimary: { street: '4306 Spann Ave', city: 'Indianapolis', state: 'IN', zip: '46203' },
    expectSplits: [{ street: '1912 S Emerson Ave', city: 'Indianapolis', state: 'IN', zip: '46203' }],
  },
]

let pass = 0, fail = 0
for (const c of cases) {
  const out = parsePropertyAddress(c.in.addr, c.in.city, c.in.state, c.in.zip)
  const expected = JSON.stringify({ primary: c.expectPrimary, splits: c.expectSplits ?? [] })
  const actual = JSON.stringify({ primary: out.primary, splits: out.splits })
  if (expected === actual) {
    console.log(`✓ ${c.label}`)
    pass++
  } else {
    console.log(`✗ ${c.label}`)
    console.log(`  EXPECTED: ${expected}`)
    console.log(`  ACTUAL:   ${actual}`)
    fail++
  }
}
console.log(`\n${pass}/${pass + fail} pass`)
process.exit(fail > 0 ? 1 : 0)
