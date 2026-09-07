import type { Customer } from './crmData'

const POSTCODES_IO_BULK_URL = 'https://api.postcodes.io/postcodes'
const BULK_SIZE = 100

export type LocationLookupSummary = {
  attempted: number
  matched: number
  failed: number
  skipped: number
  error?: string
}

type PostcodeResult = {
  query: string
  result: { latitude: number; longitude: number } | null
}

type BulkResponse = { result: PostcodeResult[] | null }

export type LocationUpdate = {
  customerId: string
  latitude: string
  longitude: string
  coordinateSource: 'postcode'
  geocodedPostcode: string
  locationVerified: true
}

export function normalizePostcode(postcode: string) {
  return postcode.trim().toUpperCase().replace(/\s+/g, ' ')
}

export function isValidUkPostcode(postcode: string) {
  return /^(GIR 0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})$/i.test(normalizePostcode(postcode))
}

function hasValidCoordinates(customer: Customer) {
  const latitude = Number(customer.latitude)
  const longitude = Number(customer.longitude)
  return Boolean(customer.locationVerified) && Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

function canLookup(customer: Customer) {
  if (!hasValidCoordinates(customer)) return true
  // A postcode lookup may be refreshed when the postcode it previously used changes. CSV or manually
  // confirmed coordinates have no postcode source and are never overwritten.
  return customer.coordinateSource === 'postcode' && customer.geocodedPostcode !== normalizePostcode(customer.postcode)
}

export async function findPostcodeLocations(customers: Customer[]): Promise<{ updates: LocationUpdate[]; summary: LocationLookupSummary }> {
  const eligible = customers.filter((customer) => isValidUkPostcode(customer.postcode) && canLookup(customer))
  const skipped = customers.filter((customer) => !isValidUkPostcode(customer.postcode) || !canLookup(customer)).length
  const updates: LocationUpdate[] = []
  let failed = customers.filter((customer) => !isValidUkPostcode(customer.postcode)).length

  try {
    for (let start = 0; start < eligible.length; start += BULK_SIZE) {
      const batch = eligible.slice(start, start + BULK_SIZE)
      const response = await fetch(POSTCODES_IO_BULK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postcodes: batch.map((customer) => normalizePostcode(customer.postcode)) }),
      })
      if (!response.ok) throw new Error(`postcodes.io returned HTTP ${response.status}`)
      const payload = await response.json() as BulkResponse
      const resultsByQuery = new Map((payload.result || []).map((result) => [normalizePostcode(result.query), result.result]))
      batch.forEach((customer) => {
        const result = resultsByQuery.get(normalizePostcode(customer.postcode))
        if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
          failed += 1
          return
        }
        updates.push({ customerId: customer.id, latitude: String(result.latitude), longitude: String(result.longitude), coordinateSource: 'postcode', geocodedPostcode: normalizePostcode(customer.postcode), locationVerified: true })
      })
    }
  } catch (error) {
    return { updates, summary: { attempted: eligible.length, matched: updates.length, failed: Math.max(failed, eligible.length - updates.length), skipped, error: error instanceof Error ? error.message : 'The postcode service could not be reached.' } }
  }

  return { updates, summary: { attempted: eligible.length, matched: updates.length, failed, skipped } }
}
