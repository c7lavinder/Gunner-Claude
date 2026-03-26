// lib/address.ts — Address standardization
// Applied on ingest (GHL webhook + manual entry) and display

const SUFFIX_MAP: Record<string, string> = {
  road: 'Rd', rd: 'Rd',
  street: 'St', str: 'St', st: 'St',
  avenue: 'Ave', ave: 'Ave',
  drive: 'Dr', drv: 'Dr', dr: 'Dr',
  lane: 'Ln', ln: 'Ln',
  boulevard: 'Blvd', blvd: 'Blvd',
  court: 'Ct', ct: 'Ct',
  circle: 'Cir', cir: 'Cir',
  place: 'Pl', pl: 'Pl',
  terrace: 'Ter', ter: 'Ter',
  trail: 'Trl', trl: 'Trl',
  way: 'Way',
  highway: 'Hwy', hwy: 'Hwy',
  parkway: 'Pkwy', pkwy: 'Pkwy',
  loop: 'Loop',
  pike: 'Pike',
  path: 'Path',
  crossing: 'Xing', xing: 'Xing',
}

const DIRECTION_MAP: Record<string, string> = {
  north: 'N', n: 'N',
  south: 'S', s: 'S',
  east: 'E', e: 'E',
  west: 'W', w: 'W',
  northeast: 'NE', ne: 'NE',
  northwest: 'NW', nw: 'NW',
  southeast: 'SE', se: 'SE',
  southwest: 'SW', sw: 'SW',
}

const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
}

const US_STATES = new Set(Object.values(STATE_NAME_TO_ABBR))

/** Title case a word */
function titleCase(word: string): string {
  if (word.length <= 1) return word.toUpperCase()
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** Standardize a street address */
export function standardizeStreet(raw: string): string {
  if (!raw) return ''
  const words = raw.trim().split(/\s+/)

  return words.map((word, i) => {
    const lower = word.toLowerCase().replace(/[.,]/g, '')

    // Street suffix (usually last or second-to-last word)
    if (SUFFIX_MAP[lower]) return SUFFIX_MAP[lower]

    // Direction abbreviation
    if (DIRECTION_MAP[lower] && (i === 0 || i === words.length - 1 || i === words.length - 2)) {
      return DIRECTION_MAP[lower]
    }

    // Unit/Apt markers
    if (lower === 'apt' || lower === 'apartment') return 'Apt'
    if (lower === 'ste' || lower === 'suite') return 'Ste'
    if (lower === 'unit') return 'Unit'

    // Numbers stay as-is
    if (/^\d/.test(word)) return word

    // Everything else: title case
    return titleCase(word)

  }).join(' ')
}

/** Standardize city name (title case) */
export function standardizeCity(raw: string): string {
  if (!raw) return ''
  return raw.trim().split(/\s+/).map(titleCase).join(' ')
}

/** Normalize state to 2-letter abbreviation */
export function standardizeState(raw: string): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  const upper = trimmed.toUpperCase()
  if (US_STATES.has(upper)) return upper
  return STATE_NAME_TO_ABBR[trimmed.toLowerCase()] ?? trimmed
}

/** Standardize zip to 5 digits */
export function standardizeZip(raw: string): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.slice(0, 5)
}

/** Standardize all address components at once */
export function standardizeAddress(address: {
  street: string; city: string; state: string; zip: string
}): { street: string; city: string; state: string; zip: string } {
  return {
    street: standardizeStreet(address.street),
    city: standardizeCity(address.city),
    state: standardizeState(address.state),
    zip: standardizeZip(address.zip),
  }
}
