#!/usr/bin/env -S npx tsx
// scripts/apply-street-number-research.ts
//
// Owner ran outside research on the 54 properties flagged by
// diagnose-missing-street-numbers.ts and pasted the results back as
// a CSV. This script matches each row to the corresponding Property
// in the DB by seller phone number and applies whichever correction
// the research surfaced.
//
// Status values from the CSV:
//   "Full Address Found"             — has a street number; write the
//                                      whole address (street + name +
//                                      city/state/zip)
//   "Street Confirmed (No House #)"  — street/city/state/zip refined
//                                      but no number; write the corrected
//                                      values, leave address numberless
//   "Not Found"                      — no usable result; skip
//
// Idempotent. Default DRY-RUN. Pass --apply to persist.

import { db } from '../lib/db/client'
import type { Prisma } from '@prisma/client'
import { standardizeStreet, standardizeCity, standardizeState, standardizeZip } from '../lib/address'
import { resolveMarketForZip } from '../lib/properties'

const APPLY = process.argv.slice(2).includes('--apply')

// Owner-pasted CSV. Header + 54 data rows.
const CSV = `First Name,Last Name,Street Number,Street Name,City,State,Zip Code,Phone Number,Status
Kimberly,Tucker,,Hawkwood Ln,Nashville,TN,37207,+16154038639,Not Found
Norberto,Perez,,Xxx Cheatham,Lynn,MA,01905,+17814059354,Not Found
Manuel,Peixoto,,Franklin St,Bristol,RI,02809,+14014808909,Not Found
Daniel,Dunn,,Moss Spring Hollow Rd,Centerville,TN,37033,+19012773252,Street Confirmed (No House #)
Jesus,Rizo,,#56,Nashville,TN,37064,+16159475319,Not Found
Gerald,Dagnan,,Hwy 41,Guild,TN,37340,+14236378739,Street Confirmed (No House #)
Edwin,Brown,1319,Coleman Cir,Counce,TN,38326,+15106816212,Full Address Found
Jonathan,Roberts,,Liberty Hall Dr,Morristown,TN,37813,+14232310752,Street Confirmed (No House #)
Wesley,Secondcost,V405,State Route 108,Napoleon,OH,43545,+14195099818,Full Address Found
Andrew,Higdon,588,Red Tuttle Rd,Bethpage,TN,37022,+12564124120,Full Address Found
Darrell,Tyler,,Gregory Rd,Greenback,TN,37742,+18658067035,Street Confirmed (No House #)
Christopher,Kummer,,Payne Rd,Portland,TN,37148,+12705868705,Street Confirmed (No House #)
Bernardino,Evangelista,,Parcel: 094099 00200,Primm Springs,TN,38476,+16154301181,Not Found
Freeland,Holder,,N Main St Lot W Of,Mount Pleasant,TN,38474,+19316260190,Street Confirmed (No House #)
John,Youngblood,1240,Lookout Trl,Townsend,TN,37882,+18503361275,Full Address Found
Paul,Buerkle,,Northside Ave,Chattanooga,TN,37406,+17069800774,Street Confirmed (No House #)
Kurtis,Salas,,David Crockett Pkwy W,Winchester,TN,37398,+19316360730,Street Confirmed (No House #)
Regina,Davis,,Mount Olivet Rd,Hendersonville,TN,37075,+16154837502,Not Found
Sasha,Pinkerton,,Brinkley St,Ashland City,TN,37015,+16152904975,Street Confirmed (No House #)
Manuel,Young,,Hardwick Ave,Columbia,TN,38401,+19312860800,Street Confirmed (No House #)
Gerald,Johnson,,Big Cypress Rd,Cypress Inn,TN,38452,+16155214355,Street Confirmed (No House #)
Lori,Cranfill,808,Bluff View Rd,Dayton,TN,37321,+14237621344,Full Address Found
Sammy,Ray,502,Collins Rd,Tullahoma,TN,37388,+19317595743,Full Address Found
Hervery,Holloway,,Old 60 Redding Rd,Wilkesboro,NC,28697,+13237796791,Street Confirmed (No House #)
Dorothy,Humphrey,,Ford Street North,Gallatin,TN,37066,+16154985647,Street Confirmed (No House #)
Dean,Longo,,Tower Rd,Nunnelly,TN,37137,+19418222469,Street Confirmed (No House #)
Nicholas,Tabick,,W Russet Rd,McHenry,IL,60050,+18472549653,Street Confirmed (No House #)
Bruce,Simpson,,Little Marrowbone Rd,Nashville,TN,37080,+16154977011,Street Confirmed (No House #)
Paul,Buerkle,,Shady Lawn Ave,Chattanooga,TN,37406,+17069800774,Street Confirmed (No House #)
Paul,Buerkle,,Pawnee Trl,Chattanooga,TN,37406,+17069800774,Street Confirmed (No House #)
Gerry,Snoddy,,Lot 57 Harbor Point,Prospect,TN,38477,+16153300055,Not Found
Jason,Leffew,,Van Buren St,Morristown,TN,37814,+14233127871,Street Confirmed (No House #)
William,Newcom,2400,N Hillcrest Dr,Springfield,TN,37172,+16155748324,Full Address Found
Michael,Hayes,506,E Mountain View Rd,Corryton,TN,37721,+18652561443,Full Address Found
Steve,Madden,,Quail Hollow Dr,Clinton,TN,37716,+18653863303,Street Confirmed (No House #)
Michelle,Granger,,Engle Dr,Knoxville,TN,37921,+18653135357,Not Found
Gary,Burlison,,Moss Hollow Rd,Centerville,TN,37033,+19319942820,Street Confirmed (No House #)
Jerome,Jacobs,,Bradwood Drive,Gallatin,TN,37066,+15105663218,Street Confirmed (No House #)
David,Wilson,,Hwy 76,Springfield,TN,37172,+16156438098,Street Confirmed (No House #)
Peter,Geleskie,999,Gwynn Dr,Nashville,TN,37216,+16155783622,Full Address Found
Jessica,Roesch,,Us Hwy 223,Manitou Beach,MI,49253,+15174030093,Not Found
Kandra,Gunter,,County Rd 71,Riceville,TN,37370,+12818917459,Not Found
Sharon,Mumford,1921,Washington Ave,Greensboro,NC,27401,+19199209372,Full Address Found
Billy,Moore,,Hackett Ln,Carthage,TN,37030,+16157351886,Street Confirmed (No House #)
Emmett,Bonfield,,Hwy 31 E At Mount Vernon Rd,Bethpage,TN,37022,+16307457202,Not Found
Tony,Young,,Sunset Tr Ne,Cleveland,TN,37311,+14232401793,Street Confirmed (No House #)
Jonathan,Roberts,,Liberty Hall Dr,Morristown,TN,37813,+14237364986,Street Confirmed (No House #)
Ronnie,Darnell,,Davis Ln,Chuckey,TN,37641,+14232575459,Street Confirmed (No House #)
H,Harsha,,American Ave,Hopkins,SC,29061,+14242316797,Not Found
Suzanne,Dickey,,Obey City Ln,Monterey,TN,38574,+18653844585,Street Confirmed (No House #)
Michael,Riley,,Big Springs Ave Se,Cleveland,TN,37311,+14233750492,Street Confirmed (No House #)
Lewis,Gingell,,Wagon Ln,Speedwell,TN,37870,+19379017428,Not Found
Mitchell,Allen,5519,Stansbury Ln,Copperhill,TN,37317,+14234962512,Full Address Found
Darrell,Sisk,,Starboard Ct,Estill Springs,TN,37330,+19315803954,Street Confirmed (No House #)`

interface CsvRow {
  firstName: string
  lastName: string
  streetNumber: string
  streetName: string
  city: string
  state: string
  zip: string
  phone: string
  status: string
}

function parseCsv(): CsvRow[] {
  const lines = CSV.split('\n').slice(1) // drop header
  return lines.filter(l => l.trim()).map(line => {
    const [firstName, lastName, streetNumber, streetName, city, state, zip, phone, status] = line.split(',')
    return {
      firstName: firstName?.trim() ?? '',
      lastName: lastName?.trim() ?? '',
      streetNumber: streetNumber?.trim() ?? '',
      streetName: streetName?.trim() ?? '',
      city: city?.trim() ?? '',
      state: state?.trim() ?? '',
      zip: zip?.trim() ?? '',
      phone: phone?.trim() ?? '',
      status: status?.trim() ?? '',
    }
  })
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

async function main() {
  console.log(`[apply-street-research] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`)

  const rows = parseCsv()
  console.log(`[apply-street-research] ${rows.length} CSV rows`)

  // Build a phone → property index. Each phone might map to multiple
  // properties (e.g. duplicate Liberty Hall Dr Roberts entries). We
  // process them all.
  const tenant = await db.tenant.findFirst({ where: { slug: 'new-again-houses' }, select: { id: true } })
  if (!tenant) throw new Error('tenant new-again-houses not found')

  let fullAddrApplied = 0
  let streetConfirmedApplied = 0
  let notFoundSkipped = 0
  let noMatch = 0
  let alreadyClean = 0

  for (const r of rows) {
    if (r.status === 'Not Found') {
      notFoundSkipped++
      continue
    }

    // Match by phone via Seller → PropertySeller → Property
    const phoneDigits = normalizePhone(r.phone)
    const sellers = await db.seller.findMany({
      where: { tenantId: tenant.id, phone: { contains: phoneDigits.slice(-10) } },
      select: {
        id: true,
        properties: {
          select: {
            propertyId: true,
            property: {
              select: {
                id: true, address: true, city: true, state: true, zip: true,
                tenantId: true, marketId: true,
              },
            },
          },
        },
      },
    })

    const candidates = sellers.flatMap(s => s.properties.map(p => p.property))
      .filter(p => !/^\d/.test(p.address)) // restrict to numberless rows from the diagnostic

    if (candidates.length === 0) {
      noMatch++
      console.log(`  ✗ no Property match for ${r.firstName} ${r.lastName} (${r.phone}) "${r.streetName}"`)
      continue
    }

    // When one phone maps to multiple Property rows (e.g. Paul Buerkle
    // has Northside Ave / Shady Lawn Ave / Pawnee Trl all on the same
    // contact), pick the candidate whose address shares the most
    // substantive tokens with the CSV's streetName. Common street-suffix
    // tokens are filtered so they don't dominate the overlap score.
    const COMMON_SUFFIXES = new Set(['rd', 'st', 'ave', 'avenue', 'dr', 'drive', 'ln', 'lane', 'blvd', 'boulevard', 'ct', 'court', 'cir', 'circle', 'pl', 'place', 'ter', 'terrace', 'trl', 'trail', 'hwy', 'highway', 'pkwy', 'parkway', 'loop', 'pike', 'way', 'cv', 'aly', 'sq', 'route', 'rt', 'rte', 'expy', 'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'])
    const tokenize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 0 && !COMMON_SUFFIXES.has(t))
    const csvTokens = new Set(tokenize(r.streetName))
    const scored = candidates.map(p => {
      const dbTokens = tokenize(p.address)
      const overlap = dbTokens.filter(t => csvTokens.has(t)).length
      return { p, overlap }
    })
    const maxOverlap = Math.max(...scored.map(s => s.overlap))
    const properties = candidates.length === 1
      ? candidates                         // single candidate — no disambiguation needed
      : maxOverlap === 0
        ? []                               // CSV street name shares no substantive token with any candidate — skip
        : scored.filter(s => s.overlap === maxOverlap).map(s => s.p)

    if (properties.length === 0) {
      noMatch++
      console.log(`  ✗ no street-token match for ${r.firstName} ${r.lastName} (${r.phone}) "${r.streetName}" — candidates: ${candidates.map(c => `"${c.address}"`).join(', ')}`)
      continue
    }

    for (const p of properties) {
      const newAddress = r.status === 'Full Address Found' && r.streetNumber
        ? `${r.streetNumber} ${r.streetName}`
        : r.streetName
      const stdStreet = standardizeStreet(newAddress)
      const stdCity = standardizeCity(r.city)
      const stdState = standardizeState(r.state)
      const stdZip = standardizeZip(r.zip)

      const noChange =
        p.address === stdStreet &&
        (p.city ?? '') === stdCity &&
        (p.state ?? '') === stdState &&
        (p.zip ?? '') === stdZip
      if (noChange) {
        alreadyClean++
        continue
      }

      const tag = r.status === 'Full Address Found' ? '🏠' : '🛣️'
      console.log(
        `${APPLY ? '✓' : '·'} ${tag} ${p.id.slice(0, 12)}…  "${p.address}" → "${stdStreet}"  |  ${p.city}/${p.state}/${p.zip} → ${stdCity}/${stdState}/${stdZip}`,
      )

      if (APPLY) {
        // Resolve marketId if zip changed (or wasn't set)
        let newMarketId = p.marketId
        if (stdZip && stdZip !== (p.zip ?? '')) {
          newMarketId = await resolveMarketForZip(p.tenantId, stdZip)
        }

        await db.property.update({
          where: { id: p.id, tenantId: p.tenantId },
          data: {
            address: stdStreet,
            city: stdCity,
            state: stdState,
            zip: stdZip,
            marketId: newMarketId,
          },
        })

        await db.auditLog.create({
          data: {
            tenantId: p.tenantId,
            action: r.status === 'Full Address Found' ? 'cleanup.address_full_found' : 'cleanup.address_street_confirmed',
            resource: 'property',
            resourceId: p.id,
            severity: 'INFO',
            source: 'SYSTEM',
            payload: {
              before: { address: p.address, city: p.city, state: p.state, zip: p.zip },
              after: { address: stdStreet, city: stdCity, state: stdState, zip: stdZip },
              csvSource: { ...r },
            } as unknown as Prisma.InputJsonValue,
          },
        }).catch(() => { /* audit best-effort */ })
      }

      if (r.status === 'Full Address Found') fullAddrApplied++
      else streetConfirmedApplied++
    }
  }

  console.log(`\n[apply-street-research] ${APPLY ? 'applied' : 'would apply'}:`)
  console.log(`  full-address fills:        ${fullAddrApplied}`)
  console.log(`  street-only refinements:   ${streetConfirmedApplied}`)
  console.log(`  already clean:             ${alreadyClean}`)
  console.log(`  not-found skipped:         ${notFoundSkipped}`)
  console.log(`  no-match:                  ${noMatch}`)

  if (!APPLY) console.log(`\nDry-run only. Re-run with --apply to persist.`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
