// Shared CRM data model, constants and helper functions. Extracted from App.tsx as part of a pure
// structural refactor — logic is unchanged, it just lives in its own module now.

export type CleanRecord = {
  customerId: string
  date: string
  price: number
  round: string
  worker: string
  event: 'completed' | 'no-access' | 'rescheduled' | 'skipped' | 'completion-undone' | 'skip-undone' | 'no-access-undone'
  reason?: string
  scheduledDate?: string
  actionedAt?: string
  actionedBy?: string
}

export type JobOccurrence = {
  id: string
  customerId: string
  date: string
  // The un-shifted recurring-cycle due date this occurrence was generated from. A one-off reschedule
  // moves `date` but must leave this alone, so the next cycle is still calculated from the real anchor.
  cycleDueDate?: string
  status: 'scheduled' | 'completed' | 'no-access' | 'skipped'
  skipReason?: string
  price: number
  round: string
  worker: string
  generatedByCompletionOf?: string
  generatedByStatusChangeOf?: string
}

export type Customer = {
  id: string
  routePosition: number
  price: number
  frequency: string
  name: string
  address: string
  postcode: string
  telephone: string
  alternativeTelephone: string
  email: string
  addressLine1: string
  addressLine2: string
  townCity: string
  round: string
  service: string
  nextClean: string
  active: boolean
  // True when the customer's schedule was set individually, so round-level cycle changes leave it alone.
  independentSchedule?: boolean
  preferredDay: string
  payment: string
  preferredNotification: string
  source: string
  notes: string
  accessNotes: string
  propertyNotes: string
  // Stored coordinates are only ever present when locationVerified is true (a person confirmed them
  // against the exact address via the edit form). Unverified customers leave these blank and use an
  // approximate suburb reference point derived from townCity — see getCustomerCoordinates.
  latitude: string
  longitude: string
  // False means the address has no confirmed geocode: the map/navigation point is an approximate suburb
  // placeholder derived from townCity, never a hand-invented per-address point.
  locationVerified: boolean
  coordinateSource?: 'csv' | 'manual' | 'postcode'
  geocodedPostcode?: string
  lastClean: string
  cleanHistory: CleanRecord[]
  jobOccurrences: JobOccurrence[]
}

export const OPERATIONAL_STATE_STORAGE_KEY = 'kq-crm-operational-state-v1'
export const OPERATIONAL_STATE_BACKUP_STORAGE_KEY = 'kq-crm-operational-state-backup-v1'
export const OPERATIONAL_STATE_PRE_REPAIR_STORAGE_KEY = 'kq-crm-operational-state-pre-repair-v1'
export const CURRENT_USER_STORAGE_KEY = 'kq-crm-current-user-v1'
export const USERS_STORAGE_KEY = 'kq-crm-users-v1'
// v2: earlier versions seeded/persisted a default anchor from the round's current (possibly one-off
// rescheduled) visit date, which then permanently froze "Next cycle"/"Following cycle" to that stale
// date. Bumping the key drops any such stale cached anchors without touching customer/job data.
export const ROUND_CYCLE_ANCHORS_STORAGE_KEY = 'kq-crm-round-cycle-anchors-v2'

export type UserRole = 'Admin' | 'Worker'
export type CrmUser = {
  id: string
  name: string
  role: UserRole
  showJobPrices: boolean
  team?: string
}

// Temporary development users until authenticated accounts are available.
export const developmentUsers: CrmUser[] = [
  { id: 'gavin', name: 'Gavin', role: 'Admin', showJobPrices: true },
  { id: 'test-worker', name: 'Test Worker', role: 'Worker', team: 'Team North', showJobPrices: true },
]

export type CycleJob = {
  customerId: string
  price: number
  status: JobOccurrence['status']
}

export type CurrentVisit = {
  visitDate: string
  jobs: CycleJob[]
}

// The current round visit is the earliest date where an active round customer either still has a scheduled
// job, or was already actioned today — so today's completions/no-access/skips stay part of this visit's
// progress instead of disappearing the moment the next cycle's occurrence is generated.
export function getRoundCurrentVisit(roundCustomers: Customer[]): CurrentVisit | null {
  const today = todayISO()
  const activeCustomers = roundCustomers.filter((customer) => customer.active)
  const candidateDates = activeCustomers
    .map((customer) => {
      const occurrences = getJobOccurrences(customer)
      const nextScheduled = occurrences.filter((job) => job.status === 'scheduled').sort((first, second) => first.date.localeCompare(second.date))[0]
      if (nextScheduled) return nextScheduled.date
      const actionedToday = occurrences.find((job) => job.date === today && job.status !== 'scheduled')
      return actionedToday ? actionedToday.date : null
    })
    .filter((date): date is string => Boolean(date))
  if (!candidateDates.length) return null
  const visitDate = [...candidateDates].sort()[0]
  const jobs = activeCustomers.flatMap((customer) => getJobOccurrences(customer).filter((job) => job.date === visitDate).map((job) => ({ customerId: customer.id, price: job.price, status: job.status })))
  return jobs.length ? { visitDate, jobs } : null
}

export type RoundMeta = {
  name: string
  worker: string
  status: 'On schedule' | 'Behind' | 'Ahead'
}

export const roundMeta: RoundMeta[] = [
  { name: 'Harborne A', worker: 'Team North', status: 'On schedule' },
  { name: 'Moseley B', worker: 'Dan & Ellis', status: 'Ahead' },
  { name: 'Edgbaston A', worker: 'Team Central', status: 'On schedule' },
  { name: 'Kings Heath C', worker: 'Maya Singh', status: 'Behind' },
  { name: 'Selly Oak B', worker: 'Team West', status: 'On schedule' },
]

export function getJobOccurrences(customer: Customer): JobOccurrence[] {
  if (customer.jobOccurrences.length) return customer.jobOccurrences
  const worker = roundMeta.find((round) => round.name === customer.round)?.worker || 'Unassigned'
  return [{ id: `${customer.id}-${customer.nextClean}`, customerId: customer.id, date: customer.nextClean, cycleDueDate: customer.nextClean, status: 'scheduled', price: customer.price, round: customer.round, worker }]
}

export function getNextScheduledDate(customer: Customer) {
  const occurrences = getJobOccurrences(customer)
  const nextScheduled = occurrences.filter((job) => job.status === 'scheduled').sort((first, second) => first.date.localeCompare(second.date))[0]
  return nextScheduled?.date || (customer.jobOccurrences.length ? '' : customer.nextClean)
}

// The recurring-cycle anchor for the customer's next visit — unaffected by a one-off reschedule of that visit's date.
export function getNextCycleAnchorDate(customer: Customer) {
  const occurrences = getJobOccurrences(customer)
  const nextScheduled = occurrences.filter((job) => job.status === 'scheduled').sort((first, second) => first.date.localeCompare(second.date))[0]
  return nextScheduled ? (nextScheduled.cycleDueDate || nextScheduled.date) : ''
}

// Mock customers' street addresses are fictional, so per-address coordinates must never be hand-invented —
// they would silently disagree with the displayed address. Instead, an unverified customer's map point is
// derived from the suburb named in their address (townCity) via the lookup below, so the address and the
// coordinates always describe the same area by construction. Values are OpenStreetMap/Nominatim suburb
// centres (retrieved 2026-09-06): approximate suburb-level reference points, not geocodes of any address.
export const SUBURB_REFERENCE_POINTS: Record<string, [number, number]> = {
  harborne: [52.4591, -1.9481],
  moseley: [52.4473, -1.8888],
  edgbaston: [52.471, -1.9226],
  'kings heath': [52.4389, -1.8937],
  'selly oak': [52.4402, -1.9383],
}

// All seed customers are test data with fictional streets: latitude/longitude stay blank and
// locationVerified stays false, marking their map point as an approximate suburb placeholder until a
// real, address-matched location is manually confirmed via the edit form.
export const customers: Customer[] = [
  { id: 'KQ-10482', routePosition: 1, name: 'Amelia Hart', address: '14 Willow Lane, Harborne', postcode: 'B17 9QJ', telephone: '07700 900 142', alternativeTelephone: '', email: 'amelia.hart@example.com', addressLine1: '14 Willow Lane', addressLine2: '', townCity: 'Harborne', round: 'Harborne A', service: 'Window cleaning', price: 24, frequency: '4 weekly', nextClean: '2026-09-05', active: true, preferredDay: 'Thursday', payment: 'Direct debit', preferredNotification: 'SMS/Text', source: 'Referral', notes: 'Side gate is unlocked. Please close it after leaving.', accessNotes: 'Side gate is unlocked.', propertyNotes: 'Please close the gate after leaving.', latitude: '', longitude: '', locationVerified: false, lastClean: '2026-08-13', cleanHistory: [], jobOccurrences: [] },
  { id: 'KQ-10317', routePosition: 1, name: 'Thomas Bennett', address: '82 Oakfield Road, Moseley', postcode: 'B13 9JH', telephone: '07700 900 318', alternativeTelephone: '', email: 'thomas.bennett@example.com', addressLine1: '82 Oakfield Road', addressLine2: '', townCity: 'Moseley', round: 'Moseley B', service: 'Window and frame clean', price: 32, frequency: '8 weekly', nextClean: '2026-09-15', active: true, preferredDay: 'Tuesday', payment: 'Card on file', preferredNotification: 'Email', source: 'Website', notes: 'Ring bell twice. Conservatory included.', accessNotes: 'Ring bell twice.', propertyNotes: 'Conservatory included.', latitude: '', longitude: '', locationVerified: false, lastClean: '2026-07-21', cleanHistory: [], jobOccurrences: [] },
  { id: 'KQ-09864', routePosition: 1, name: 'Priya Shah', address: '6 The Spinney, Edgbaston', postcode: 'B15 3TR', telephone: '07700 900 527', alternativeTelephone: '', email: 'priya.shah@example.com', addressLine1: '6 The Spinney', addressLine2: '', townCity: 'Edgbaston', round: 'Edgbaston A', service: 'Window cleaning', price: 20, frequency: '6 weekly', nextClean: '2026-09-18', active: true, preferredDay: 'Friday', payment: 'Direct debit', preferredNotification: 'Text', source: 'Google', notes: 'Text on arrival.', accessNotes: 'Text on arrival.', propertyNotes: '', latitude: '', longitude: '', locationVerified: false, lastClean: '2026-08-07', cleanHistory: [], jobOccurrences: [] },
  { id: 'KQ-10105', routePosition: 1, name: 'George Williams', address: '29 Station Road, Kings Heath', postcode: 'B14 7SR', telephone: '07700 900 641', alternativeTelephone: '', email: 'george.williams@example.com', addressLine1: '29 Station Road', addressLine2: '', townCity: 'Kings Heath', round: 'Kings Heath C', service: 'Window cleaning', price: 18.5, frequency: '4 weekly', nextClean: '2026-09-22', active: true, preferredDay: 'Tuesday', payment: 'Cash', preferredNotification: 'Phone', source: 'Existing customer', notes: 'Customer prefers rear windows cleaned first.', accessNotes: '', propertyNotes: 'Rear windows first.', latitude: '', longitude: '', locationVerified: false, lastClean: '2026-08-25', cleanHistory: [], jobOccurrences: [] },
  { id: 'KQ-08742', routePosition: 1, name: 'Nora Collins', address: '3 Larch Close, Selly Oak', postcode: 'B29 6PN', telephone: '07700 900 893', alternativeTelephone: '', email: 'nora.collins@example.com', addressLine1: '3 Larch Close', addressLine2: '', townCity: 'Selly Oak', round: 'Selly Oak B', service: 'Window cleaning', price: 22, frequency: '12 weekly', nextClean: '2026-10-04', active: false, preferredDay: 'Monday', payment: 'Invoice', preferredNotification: 'Email', source: 'Referral', notes: 'Paused until October while property is renovated.', accessNotes: '', propertyNotes: 'Property renovation in progress.', latitude: '', longitude: '', locationVerified: false, lastClean: '2026-07-12', cleanHistory: [], jobOccurrences: [] },
]

export function buildNextCustomerReference(existingCustomers: Customer[]) {
  const references = existingCustomers
    .map((customer) => Number.parseInt(customer.id.replace(/[^\d]/g, ''), 10))
    .filter((value) => Number.isFinite(value))
  const highest = references.length ? Math.max(...references) : 10000
  return `KQ-${highest + 1}`
}

export function emptyCustomer(): Customer {
  return {
    id: '',
    routePosition: 1,
    name: '',
    address: '',
    postcode: '',
    telephone: '',
    alternativeTelephone: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    townCity: '',
    round: roundOptions[0] || '',
    service: 'Window cleaning',
    price: 0,
    frequency: defaultCustomerValues.frequency,
    nextClean: '',
    active: true,
    preferredDay: defaultCustomerValues.preferredDay,
    payment: defaultCustomerValues.payment,
    preferredNotification: defaultCustomerValues.preferredNotification,
    source: '',
    notes: '',
    accessNotes: '',
    propertyNotes: '',
    latitude: '',
    longitude: '',
    locationVerified: false,
    lastClean: '',
    cleanHistory: [],
    jobOccurrences: [],
  }
}

export function numericPrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value).replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function normalizeCustomerPrices(customer: Customer): Customer {
  // Records stored by older app versions may lack these arrays — default them so loading never drops a customer.
  const cleanHistory = Array.isArray(customer.cleanHistory) ? customer.cleanHistory : []
  const jobOccurrences = Array.isArray(customer.jobOccurrences) ? customer.jobOccurrences : []
  return {
    ...customer,
    price: numericPrice(customer.price),
    cleanHistory: cleanHistory.map((record) => ({ ...record, price: numericPrice(record.price) })),
    jobOccurrences: jobOccurrences.map((job) => ({ ...job, price: numericPrice(job.price) })),
  }
}

// Legacy seed/stored records may carry hand-invented placeholder latitude/longitude that do not match the
// customer's address (all mock customers have fictional streets). Strip any coordinates that were never
// explicitly confirmed so the map/navigation point is derived from the address suburb (see
// SUBURB_REFERENCE_POINTS) instead of silently disagreeing with the displayed address.
export function normalizeCustomerLocation(customer: Customer): Customer {
  if (customer.locationVerified) return customer
  if (!customer.latitude && !customer.longitude && customer.locationVerified === false) return customer
  return { ...customer, latitude: '', longitude: '', locationVerified: false }
}

export function loadOperationalState() {
  try {
    const stored = window.localStorage.getItem(OPERATIONAL_STATE_STORAGE_KEY)
    if (!stored) return customers
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Stored customer state is not an array')
    return repairStoredCustomerState((parsed as Customer[]).map(normalizeCustomerPrices).map(normalizeCustomerLocation))
  } catch (error) {
    // Never silently discard stored customer data: back it up for recovery instead of overwriting it with seed data.
    const stored = window.localStorage.getItem(OPERATIONAL_STATE_STORAGE_KEY)
    if (stored) {
      window.localStorage.setItem(OPERATIONAL_STATE_BACKUP_STORAGE_KEY, stored)
      window.localStorage.removeItem(OPERATIONAL_STATE_STORAGE_KEY)
      console.error('Stored customer state could not be loaded; it was backed up instead of being discarded.', error)
    }
    return customers
  }
}

export function persistOperationalState(records: Customer[]) {
  window.localStorage.setItem(OPERATIONAL_STATE_STORAGE_KEY, JSON.stringify(records))
}

export type RoundMembershipRepair = {
  customerId: string
  customerName: string
  from: string
  to: string
  evidence: string[]
}

// Round membership is stored on the customer record (customer.round) and must never depend on
// scheduled dates. Job occurrences and cleaning-history entries each snapshot the round at the
// moment they were written, so if an earlier app version corrupted customer.round, the original
// assignment can be recovered from that evidence. This never creates or deletes customer records
// and never changes scheduling dates — it only repairs membership and route order on records
// that already exist.
export function repairStoredCustomerState(records: Customer[]) {
  const evidenceRoundNames = records.flatMap((customer) => [
    ...customer.jobOccurrences.map((job) => job.round),
    ...customer.cleanHistory.map((record) => record.round),
  ])
  // Rounds a customer can legitimately belong to: configured rounds, seed-data rounds, and any
  // round referenced by stored scheduling evidence. Anything else on a record is corruption.
  const knownRounds = new Set([...roundMeta.map((round) => round.name), ...customers.map((customer) => customer.round), ...evidenceRoundNames].filter(Boolean))
  const repairs: RoundMembershipRepair[] = []
  const membershipRepaired = records.map((customer) => {
    if (customer.round && knownRounds.has(customer.round)) return customer
    const evidence = [...customer.cleanHistory.map((record) => record.round), ...customer.jobOccurrences.map((job) => job.round)].filter(Boolean)
    if (!evidence.length) return customer
    const restoredRound = evidence[evidence.length - 1]
    repairs.push({ customerId: customer.id, customerName: customer.name, from: customer.round || '(blank)', to: restoredRound, evidence: [...new Set(evidence)] })
    return { ...customer, round: restoredRound }
  })

  // Route order repair: re-sequence each round's route positions to 1..n while preserving the
  // existing relative order, so restored members slot back into their original route position
  // and duplicate/gapped positions can never hide or misorder a customer.
  let routeOrderChanged = false
  const membersByRound = new Map<string, Customer[]>()
  membershipRepaired.forEach((customer) => {
    const members = membersByRound.get(customer.round) || []
    members.push(customer)
    membersByRound.set(customer.round, members)
  })
  const repairedPositions = new Map<string, number>()
  membersByRound.forEach((members) => {
    const sortedMembers = [...members].sort((first, second) => first.routePosition - second.routePosition)
    sortedMembers.forEach((customer, index) => repairedPositions.set(customer.id, index + 1))
  })
  const repairedRecords = membershipRepaired.map((customer) => {
    const routePosition = repairedPositions.get(customer.id)
    if (routePosition === undefined || routePosition === customer.routePosition) return customer
    routeOrderChanged = true
    return { ...customer, routePosition }
  })

  if (repairs.length || routeOrderChanged) {
    // Keep one snapshot of the pre-repair state for recovery before persisting the repaired state.
    if (!window.localStorage.getItem(OPERATIONAL_STATE_PRE_REPAIR_STORAGE_KEY)) {
      window.localStorage.setItem(OPERATIONAL_STATE_PRE_REPAIR_STORAGE_KEY, JSON.stringify(records))
    }
    persistOperationalState(repairedRecords)
  }

  repairs.forEach((repair) => console.warn(`[KQ CRM] Restored round membership: ${repair.customerName} (${repair.customerId}) ${repair.from} -> ${repair.to}`, repair.evidence))
  console.info('[KQ CRM] Round membership integrity check', {
    customersLoaded: records.length,
    membershipsRestored: repairs,
    routeOrderRepaired: routeOrderChanged,
    unassignedCustomers: repairedRecords.filter((customer) => !customer.round || !knownRounds.has(customer.round)).map((customer) => ({ id: customer.id, name: customer.name })),
    rounds: buildRoundSummaries(repairedRecords).map((round) => ({ round: round.name, customers: round.customerCount, value: round.roundValue, routeOrder: round.customers.map((customer) => customer.name) })),
  })
  return repairedRecords
}

// Round cycle anchors only ever hold an *explicit* override set via "Change cycle start date"
// (changeRoundCycleStartDate). Rounds with no override fall through to the live, occurrence-derived
// round.nextCycleAnchor — never to a cached default — so a one-off rescheduled visit date can never get
// baked in here and frozen across reloads.
export function loadRoundCycleAnchors(): Record<string, string> {
  try {
    const stored = window.localStorage.getItem(ROUND_CYCLE_ANCHORS_STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

export function persistRoundCycleAnchors(anchors: Record<string, string>) {
  window.localStorage.setItem(ROUND_CYCLE_ANCHORS_STORAGE_KEY, JSON.stringify(anchors))
}

export function loadCurrentUserId() {
  try {
    const storedUserId = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY)
    return developmentUsers.some((user) => user.id === storedUserId) ? storedUserId as string : developmentUsers[0].id
  } catch {
    return developmentUsers[0].id
  }
}

export function loadUsers() {
  try {
    const stored = window.localStorage.getItem(USERS_STORAGE_KEY)
    if (!stored) return developmentUsers
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return developmentUsers
    return developmentUsers.map((user) => {
      const storedUser = parsed.find((candidate): candidate is Partial<CrmUser> => candidate?.id === user.id)
      return { ...user, showJobPrices: storedUser?.showJobPrices !== false }
    })
  } catch {
    return developmentUsers
  }
}

export function canSeeJobPrices(user: CrmUser) {
  return user.role === 'Admin' || user.showJobPrices
}

export function getUserInitials(user: CrmUser) {
  return user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

export const frequencyOptions = ['1 weekly', '2 weekly', '4 weekly', '6 weekly', '8 weekly', '12 weekly']
export const preferredDayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'No preference']
export const notificationOptions = ['SMS/Text', 'WhatsApp', 'Email', 'Phone call', 'None']
export const paymentOptions = ['Direct debit', 'Cash', 'Bank transfer', 'Card', 'Other']
export const roundOptions = [...new Set([...roundMeta.map((round) => round.name), ...customers.map((customer) => customer.round)])]
export const serviceOptions = ['Window cleaning', 'Front window cleaning', 'Gutter clearing', 'Fascia & soffit cleaning', 'Conservatory cleaning', 'Other']

export const defaultCustomerValues = {
  frequency: '4 weekly',
  preferredDay: 'No preference',
  payment: 'Direct debit',
  preferredNotification: 'SMS/Text',
}

export type RoundSummary = RoundMeta & {
  customers: Customer[]
  customerCount: number
  roundValue: number
  averageValue: number
  mainFrequency: string
  nextWorkDue: string
  // The true recurring-cycle anchor for the next visit, ignoring any one-off reschedule of its date.
  nextCycleAnchor: string
  cycle: CurrentVisit | null
}

export function buildRoundSummaries(customerRecords: Customer[]): RoundSummary[] {
  return roundMeta.map((meta) => {
    const roundCustomers = customerRecords.filter((customer) => customer.round === meta.name)
    const roundValue = roundCustomers.reduce((total, customer) => total + customer.price, 0)
    const frequencyCounts = roundCustomers.reduce<Record<string, number>>((counts, customer) => ({ ...counts, [customer.frequency]: (counts[customer.frequency] || 0) + 1 }), {})
    const mainFrequency = Object.entries(frequencyCounts).sort(([, first], [, second]) => second - first)[0]?.[0] || 'Not set'
    const customersByRoute = [...roundCustomers].sort((first, second) => first.routePosition - second.routePosition)
    const activeRoundCustomers = roundCustomers.filter((customer) => customer.active).sort((first, second) => getNextScheduledDate(first).localeCompare(getNextScheduledDate(second)))
    const nextWorkDue = activeRoundCustomers[0] ? getNextScheduledDate(activeRoundCustomers[0]) : 'No scheduled work'
    const nextCycleAnchor = activeRoundCustomers[0] ? getNextCycleAnchorDate(activeRoundCustomers[0]) : ''
    const cycle = getRoundCurrentVisit(roundCustomers)
    return { ...meta, customers: customersByRoute, customerCount: roundCustomers.length, roundValue, averageValue: roundCustomers.length ? roundValue / roundCustomers.length : 0, mainFrequency, nextWorkDue, nextCycleAnchor, cycle }
  })
}

export function getRouteOrder(customerRecords: Customer[]) {
  return buildRoundSummaries(customerRecords).reduce((order, round) => {
    round.customers.forEach((customer, index) => order.set(customer.id, index + 1))
    return order
  }, new Map<string, number>())
}

// Safety invariant: scheduling operations must never add or remove customer records.
export function preservesCustomerSet(before: Customer[], after: Customer[]) {
  if (before.length !== after.length) return false
  const ids = new Set(before.map((customer) => customer.id))
  return after.every((customer) => ids.has(customer.id))
}

export function parseStoredCoordinates(customer: Customer): [number, number] | null {
  if (!customer.latitude || !customer.longitude) return null
  const lat = Number(String(customer.latitude).trim())
  const lng = Number(String(customer.longitude).trim())
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    return [lat, lng]
  }
  return null
}

// Placeholder map point for customers whose exact address has never been confirmed: derived from the
// suburb in their displayed address, so the point can never accidentally disagree with the address.
// Returns null when the suburb has no reference point (navigation then falls back to the address text).
export function getSuburbReferencePoint(customer: Customer): [number, number] | null {
  return SUBURB_REFERENCE_POINTS[(customer.townCity || '').trim().toLowerCase()] || null
}

// Single source of truth for a customer's map point — used by both "View on map" and Google Maps
// Navigate, so they always agree. Verified records use their stored, human-confirmed coordinates;
// unverified records never trust stored latitude/longitude (legacy placeholders) and instead derive a
// clearly-labelled approximate suburb reference point from the address itself.
export function getCustomerCoordinates(customer: Customer): [number, number] | null {
  if (customer.locationVerified) {
    const stored = parseStoredCoordinates(customer)
    if (stored) return stored
  }
  return getSuburbReferencePoint(customer)
}

export function openGoogleMapsNavigation(customer: Customer) {
  const coords = getCustomerCoordinates(customer)
  let destination = ''
  if (coords) {
    destination = `${coords[0]},${coords[1]}`
  } else {
    destination = [customer.addressLine1 || customer.address, customer.addressLine2, customer.townCity, customer.postcode].filter(Boolean).join(', ')
    if (!destination) {
      destination = customer.postcode || customer.address || ''
    }
  }
  if (!destination) return
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function formatCurrency(value: number) {
  return `£${value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDateUK(isoDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function formatDateTimeUK(timestamp: string, fallbackDate: string) {
  if (!timestamp) return `${formatDateUK(fallbackDate)} at time unavailable`
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp)).replace(',', ' at')
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export function addFrequencyWeeks(date: string, frequency: string) {
  const weeks = Number(frequency.match(/^(\d+)\s+weekly$/i)?.[1] || 0)
  if (!weeks) return date
  const [year, month, day] = date.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + weeks * 7))
  return result.toISOString().slice(0, 10)
}

// Closes out a job occurrence (completed / no-access / skipped) and works out the date + anchor for the
// occurrence that replaces it as the active cycle. Applies to every supported frequency, since it only
// ever calls addFrequencyWeeks once per step.
//
// The closed occurrence's own cycleDueDate is always its true recurring-cycle anchor, regardless of
// whether a one-off "Reschedule this visit" moved its working date earlier or later. Closing it — whether
// completed on time or completed early/late via a one-off reschedule — fulfils that anchor, so the
// replacement occurrence always advances one full frequency period on from it. This is what stops a
// completed one-off reschedule from either (a) resurrecting the original anchor date as a fresh separate
// visit, or (b) leaving a stale earlier occurrence behind as the active cycle.
export function getNextOccurrenceDates(currentOccurrence: JobOccurrence, frequency: string) {
  const cycleAnchorBasis = currentOccurrence.cycleDueDate || currentOccurrence.date
  const followingAnchor = addFrequencyWeeks(cycleAnchorBasis, frequency)
  return { date: followingAnchor, cycleDueDate: followingAnchor }
}

export type ScheduledJob = {
  customer: Customer
  occurrence: JobOccurrence
}

// Single source of truth for "what job occurrences fall on this date" — Workload planner, Coming up and Today's Work all read through this so their counts/values can never diverge.
export function getJobsForDate(customerRecords: Customer[], date: string, user?: CrmUser): ScheduledJob[] {
  return customerRecords
    .filter((customer) => customer.active)
    .flatMap((customer) => getJobOccurrences(customer).filter((occurrence) => occurrence.date === date && (!user || user.role === 'Admin' || occurrence.worker === user.name || occurrence.worker === user.team)).map((occurrence) => ({ customer, occurrence })))
    .sort((first, second) => first.customer.round.localeCompare(second.customer.round) || first.customer.routePosition - second.customer.routePosition || first.customer.name.localeCompare(second.customer.name))
}

export function getScheduledJobsForDate(customerRecords: Customer[], date: string, user?: CrmUser): ScheduledJob[] {
  return getJobsForDate(customerRecords, date, user).filter((job) => job.occurrence.status === 'scheduled')
}

export function formatDayShort(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function startOfWeekMonday(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  const current = new Date(Date.UTC(year, month - 1, day))
  const dayOfWeek = current.getUTCDay() || 7
  current.setUTCDate(current.getUTCDate() - dayOfWeek + 1)
  return current.toISOString().slice(0, 10)
}

export function formatWeekLabel(date: string) {
  return `Week commencing ${formatDateUK(date)}`
}
