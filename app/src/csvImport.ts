// Pure CSV helpers for the customer import flow. No React/DOM/Leaflet dependencies, so the parsing,
// column-mapping and row-validation logic stays testable in isolation from the UI.

export type ImportFieldKey =
  | 'name'
  | 'addressLine1'
  | 'addressLine2'
  | 'townCity'
  | 'postcode'
  | 'telephone'
  | 'email'
  | 'round'
  | 'price'
  | 'frequency'
  | 'latitude'
  | 'longitude'

export const IMPORT_FIELDS: { key: ImportFieldKey; label: string; optional?: boolean }[] = [
  { key: 'name', label: 'Customer name' },
  { key: 'addressLine1', label: 'Address' },
  { key: 'addressLine2', label: 'Address line 2', optional: true },
  { key: 'townCity', label: 'Town / city', optional: true },
  { key: 'postcode', label: 'Postcode' },
  { key: 'telephone', label: 'Phone', optional: true },
  { key: 'email', label: 'Email', optional: true },
  { key: 'round', label: 'Round', optional: true },
  { key: 'price', label: 'Price', optional: true },
  { key: 'frequency', label: 'Frequency', optional: true },
  { key: 'latitude', label: 'Latitude', optional: true },
  { key: 'longitude', label: 'Longitude', optional: true },
]

// A mapping points each CRM field at the index of the CSV column that holds its values.
export type ColumnMapping = Partial<Record<ImportFieldKey, number>>

const FIELD_SYNONYMS: Record<ImportFieldKey, string[]> = {
  name: ['name', 'customer name', 'customer', 'full name', 'account name', 'customer ref name'],
  addressLine1: ['address', 'address 1', 'address line 1', 'address1', 'addr1', 'street', 'street address', 'first line', 'house'],
  addressLine2: ['address 2', 'address line 2', 'address2', 'addr2', 'second line'],
  townCity: ['town', 'city', 'town city', 'town/city', 'locality', 'area', 'address 3', 'address line 3'],
  postcode: ['postcode', 'post code', 'postal code', 'zip', 'zip code', 'pcode', 'pc'],
  telephone: ['phone', 'telephone', 'tel', 'mobile', 'mob', 'phone number', 'telephone number', 'contact number', 'mobile number'],
  email: ['email', 'e-mail', 'email address', 'mail'],
  round: ['round', 'round name', 'route', 'run', 'patch'],
  price: ['price', 'amount', 'value', 'cost', 'charge', 'job price', 'clean price', 'price £', '£'],
  frequency: ['frequency', 'freq', 'schedule', 'visit frequency', 'how often', 'every', 'weeks', 'clean frequency'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon', 'long'],
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9£]+/g, ' ').trim()
}

// Pick the most likely CSV column for every field. Exact (normalized) header matches win first, then
// prefix/substring matches; each column can only be assigned to one field.
export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}
  const usedColumns = new Set<number>()
  const normalizedHeaders = headers.map(normalizeHeader)
  const assign = (field: ImportFieldKey, columnIndex: number) => {
    if (mapping[field] !== undefined || usedColumns.has(columnIndex)) return
    mapping[field] = columnIndex
    usedColumns.add(columnIndex)
  }
  for (const match of [true, false]) {
    for (const field of IMPORT_FIELDS) {
      const synonyms = FIELD_SYNONYMS[field.key].map(normalizeHeader)
      normalizedHeaders.forEach((header, columnIndex) => {
        if (!header) return
        const isMatch = match
          ? synonyms.some((synonym) => header === synonym)
          : synonyms.some((synonym) => synonym.length > 2 && (header.startsWith(synonym) || header.includes(synonym)))
        if (isMatch) assign(field.key, columnIndex)
      })
    }
  }
  return mapping
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] || ''
  const candidates = [',', ';', '\t']
  return candidates.sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
}

// RFC-4180-style parser: handles quoted fields, embedded delimiters/newlines and escaped ("") quotes,
// CRLF line endings and a UTF-8 BOM. Empty trailing rows are dropped.
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM so the first header name parses cleanly.
  const source = text.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(source)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += char
    }
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

export function parseCoordinate(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

export function parsePrice(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

// Normalizes free-text frequency onto the app's "N weekly" pattern. Unrecognised values fall back to
// the most common window-cleaning cadence rather than blocking the import.
export function normalizeFrequency(value: string): string {
  const text = value.trim().toLowerCase()
  if (!text) return '4 weekly'
  const weeksMatch = text.match(/(\d+)\s*(?:weekly|week|wk)/)
  if (weeksMatch) return `${Number(weeksMatch[1])} weekly`
  if (/fort\s?night/.test(text)) return '2 weekly'
  if (/quarter/.test(text)) return '12 weekly'
  if (/bi-?\s?month|2\s*month|two\s*month/.test(text)) return '8 weekly'
  if (/month/.test(text)) return '4 weekly'
  if (/week/.test(text)) return '1 weekly'
  return '4 weekly'
}

export type AnalyzedRow = {
  rowNumber: number
  fields: Record<ImportFieldKey, string>
  price: number
  frequency: string
  coords: [number, number] | null
  issues: string[]
  duplicateOf: string | null
  importable: boolean
}

export type ImportAnalysis = {
  rows: AnalyzedRow[]
  totalRows: number
  importableRows: number
  duplicateRows: number
  invalidRows: number
  missingAddressRows: number
  withCoordinates: number
  locationRequired: number
}

function duplicateKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

// Keys that identify "the same customer" for duplicate detection, both inside the file and against the
// records already in the CRM.
export function customerDuplicateKeys(parts: { name: string; addressLine1: string; postcode: string }): string[] {
  const name = duplicateKey(parts.name)
  const address = duplicateKey(parts.addressLine1)
  const postcode = duplicateKey(parts.postcode)
  const keys: string[] = []
  if (name && postcode) keys.push(`${name}|${postcode}`)
  if (address && postcode) keys.push(`${address}|${postcode}`)
  if (!postcode && name && address) keys.push(`${name}|${address}`)
  return keys
}

export function analyzeRows(
  dataRows: string[][],
  mapping: ColumnMapping,
  existingCustomers: { name: string; address: string; addressLine1: string; postcode: string }[],
): ImportAnalysis {
  const read = (cells: string[], field: ImportFieldKey) => {
    const columnIndex = mapping[field]
    return columnIndex === undefined ? '' : (cells[columnIndex] || '').trim()
  }
  const seenKeys = new Map<string, string>()
  existingCustomers.forEach((customer) => {
    customerDuplicateKeys({ name: customer.name, addressLine1: customer.addressLine1 || customer.address, postcode: customer.postcode }).forEach((key) => {
      if (!seenKeys.has(key)) seenKeys.set(key, customer.name)
    })
  })

  const rows: AnalyzedRow[] = dataRows.map((cells, index) => {
    const fields = Object.fromEntries(IMPORT_FIELDS.map((field) => [field.key, read(cells, field.key)])) as Record<ImportFieldKey, string>
    const issues: string[] = []
    const hasName = Boolean(fields.name)
    const hasAddress = Boolean(fields.addressLine1 || fields.addressLine2 || fields.townCity)
    const hasPostcode = Boolean(fields.postcode)

    if (!hasName) issues.push('Missing customer name')
    if (!hasAddress && !hasPostcode) issues.push('Missing address and postcode')
    else {
      if (!hasAddress) issues.push('Missing address')
      if (!hasPostcode) issues.push('Missing postcode')
    }

    // Coordinates are only trusted as a complete, in-range pair — anything else leaves the row with no
    // location rather than inventing or half-keeping a point.
    let coords: [number, number] | null = null
    const lat = parseCoordinate(fields.latitude)
    const lng = parseCoordinate(fields.longitude)
    const hasLat = fields.latitude !== ''
    const hasLng = fields.longitude !== ''
    if (hasLat && hasLng) {
      if (lat !== null && lng !== null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        coords = [lat, lng]
      } else {
        issues.push('Invalid coordinates')
      }
    } else if (hasLat || hasLng) {
      issues.push('Incomplete coordinates')
    }

    const importable = hasName && (hasAddress || hasPostcode)
    let duplicateOf: string | null = null
    if (importable) {
      const keys = customerDuplicateKeys({ name: fields.name, addressLine1: fields.addressLine1, postcode: fields.postcode })
      const matchedKey = keys.find((key) => seenKeys.has(key))
      if (matchedKey) {
        duplicateOf = seenKeys.get(matchedKey) || null
      } else {
        keys.forEach((key) => seenKeys.set(key, fields.name))
      }
    }

    return { rowNumber: index + 2, fields, price: parsePrice(fields.price), frequency: normalizeFrequency(fields.frequency), coords, issues, duplicateOf, importable }
  })

  const importableRows = rows.filter((row) => row.importable && !row.duplicateOf)
  return {
    rows,
    totalRows: rows.length,
    importableRows: importableRows.length,
    duplicateRows: rows.filter((row) => row.duplicateOf).length,
    invalidRows: rows.filter((row) => !row.importable).length,
    missingAddressRows: rows.filter((row) => row.importable && !row.duplicateOf && row.issues.some((issue) => issue.startsWith('Missing'))).length,
    withCoordinates: importableRows.filter((row) => row.coords).length,
    locationRequired: importableRows.filter((row) => !row.coords).length,
  }
}
