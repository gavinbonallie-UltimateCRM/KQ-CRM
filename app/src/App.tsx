import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { CustomerCsvImport } from './CustomerCsvImport'
import { CustomerEditForm as ExtractedCustomerEditForm, CustomerList as ExtractedCustomerList } from './customers'
import { MapScreen as ExtractedMapScreen } from './map'
import { MoreMenu as ExtractedMoreMenu } from './more'
import { CustomerProfile as ExtractedCustomerProfile } from './customerDetails'
import { Home } from './home'
import { TodaysWork as ExtractedTodaysWork } from './todaysWork'
import { findPostcodeLocations, type LocationLookupSummary } from './postcodeLocations'
import { Icon, type IconName } from './ui'
import { RoundDetails, RoundsOverview } from './rounds'
import {
  buildNextCustomerReference,
  buildRoundSummaries,
  type CrmUser,
  type Customer,
  type JobOccurrence,
  emptyCustomer,
  getJobOccurrences,
  getNextOccurrenceDates,
  getRouteOrder,
  getUserInitials,
  loadCurrentUserId,
  loadOperationalState,
  loadRoundCycleAnchors,
  loadUsers,
  persistOperationalState,
  persistRoundCycleAnchors,
  preservesCustomerSet,
  roundMeta,
  type RoundSummary,
  todayISO,
  USERS_STORAGE_KEY,
  CURRENT_USER_STORAGE_KEY,
} from './crmData'


function App() {
  const [users, setUsers] = useState<CrmUser[]>(loadUsers)
  const [selectedUserId, setSelectedUserId] = useState(loadCurrentUserId)
  const currentUser = users.find((user) => user.id === selectedUserId) ?? users[0]
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [screen, setScreen] = useState<'dashboard' | 'customers' | 'rounds' | 'work' | 'more' | 'map'>(() => currentUser.role === 'Worker' ? 'work' : 'dashboard')
  const [customerRecords, setCustomerRecords] = useState(loadOperationalState)
  const [roundCycleAnchors, setRoundCycleAnchors] = useState(() => loadRoundCycleAnchors())
  useEffect(() => {
    persistOperationalState(customerRecords)
  }, [customerRecords])
  useEffect(() => {
    persistRoundCycleAnchors(roundCycleAnchors)
  }, [roundCycleAnchors])
  useEffect(() => {
    window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
  }, [users])
  useEffect(() => {
    window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, currentUser.id)
    if (currentUser.role === 'Worker') setScreen('work')
  }, [currentUser.id, currentUser.role])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedRound, setSelectedRound] = useState<RoundSummary | null>(null)
  const [addingCustomer, setAddingCustomer] = useState(false)
  const [importingCustomers, setImportingCustomers] = useState(false)
  const [mapFocusCustomer, setMapFocusCustomer] = useState<Customer | null>(null)
  // Scroll to the top whenever the active page/view changes (screen, open customer/round, add-customer form),
  // but never on in-place actions (Complete, Reschedule, filters, edits, modals) that don't change these values.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen, selectedCustomer?.id, selectedRound?.name, addingCustomer, importingCustomers])
  const openCustomers = () => { if (currentUser.role !== 'Admin') return; setSelectedCustomer(null); setSelectedRound(null); setScreen('customers') }
  const openRounds = () => { if (currentUser.role !== 'Admin') return; setSelectedCustomer(null); setSelectedRound(null); setScreen('rounds') }
  const openWork = () => { setSelectedCustomer(null); setSelectedRound(null); setScreen('work') }
  const openMore = () => { if (currentUser.role !== 'Admin') return; setSelectedCustomer(null); setSelectedRound(null); setScreen('more') }
  const openMap = () => {
    setSelectedCustomer(null)
    setSelectedRound(null)
    setMapFocusCustomer(null)
    setScreen('map')
  }
  const viewCustomerOnMap = (customer: Customer) => {
    setSelectedCustomer(null)
    setSelectedRound(null)
    setMapFocusCustomer(customer)
    setScreen('map')
  }
  const goHome = () => { if (currentUser.role !== 'Admin') return; setSelectedCustomer(null); setScreen('dashboard') }
  const switchUser = (userId: string) => {
    setSelectedUserId(userId)
    setProfileMenuOpen(false)
    const nextUser = users.find((user) => user.id === userId)
    if (nextUser?.role === 'Worker') setScreen('work')
    else setScreen('dashboard')
  }
  const updateUserPriceVisibility = (userId: string, showJobPrices: boolean) => {
    if (currentUser.role !== 'Admin') return
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, showJobPrices } : user))
  }
  const saveCustomer = (updatedCustomer: Customer) => {
    // A manually edited next-clean date makes that customer's schedule explicitly independent of the round cycle.
    setCustomerRecords((current) => current.map((customer) => customer.id === updatedCustomer.id ? { ...updatedCustomer, independentSchedule: updatedCustomer.nextClean !== customer.nextClean ? true : updatedCustomer.independentSchedule } : customer))
    setSelectedCustomer(updatedCustomer)
  }
  const addCustomer = (customer: Customer) => {
    const nextReference = customer.id || buildNextCustomerReference(customerRecords)
    const worker = roundMeta.find((round) => round.name === customer.round)?.worker || 'Unassigned'
    const occurrence: JobOccurrence = { id: `${nextReference}-${customer.nextClean}`, customerId: nextReference, date: customer.nextClean, cycleDueDate: customer.nextClean, status: 'scheduled', price: customer.price, round: customer.round, worker }
    const roundCustomerCount = customerRecords.filter((record) => record.round === customer.round).length
    const customerWithOccurrence = {
      ...customer,
      id: nextReference,
      service: customer.service || 'Window cleaning',
      routePosition: customer.routePosition || roundCustomerCount + 1,
      address: [customer.addressLine1, customer.addressLine2, customer.townCity].filter(Boolean).join(', '),
      jobOccurrences: [occurrence],
    }
    setCustomerRecords((current) => current.some((record) => record.id === nextReference) ? current : [...current, customerWithOccurrence])
    setAddingCustomer(false)
  }
  // Bulk CSV import. Unlike addCustomer this creates NO job occurrences and touches no dates — importing
  // customers must never schedule, move or generate work. It only appends customer records, assigning
  // each a fresh reference and placing it at the end of its round's route order.
  const importCustomers = (importedCustomers: Customer[]) => {
    setCustomerRecords((current) => {
      const numericReferences = current.map((record) => Number.parseInt(record.id.replace(/[^\d]/g, ''), 10)).filter((value) => Number.isFinite(value))
      let nextNumber = (numericReferences.length ? Math.max(...numericReferences) : 10000) + 1
      const routeTails = new Map<string, number>()
      current.forEach((record) => routeTails.set(record.round, Math.max(routeTails.get(record.round) || 0, record.routePosition || 0)))
      const additions = importedCustomers.map((record) => {
        const position = (routeTails.get(record.round) || 0) + 1
        routeTails.set(record.round, position)
        const assigned = { ...record, id: `KQ-${nextNumber}`, routePosition: position }
        nextNumber += 1
        return assigned
      })
      return [...current, ...additions]
    })
  }
  const findCustomerLocations = async (): Promise<LocationLookupSummary> => {
    const result = await findPostcodeLocations(customerRecords)
    if (result.updates.length) {
      const updates = new Map(result.updates.map((update) => [update.customerId, update]))
      setCustomerRecords((current) => current.map((customer) => {
        const update = updates.get(customer.id)
        return update ? { ...customer, latitude: update.latitude, longitude: update.longitude, locationVerified: true, coordinateSource: update.coordinateSource, geocodedPostcode: update.geocodedPostcode } : customer
      }))
    }
    return result.summary
  }
  const openImport = () => {
    if (currentUser.role !== 'Admin') return
    setSelectedCustomer(null)
    setSelectedRound(null)
    setAddingCustomer(false)
    setImportingCustomers(true)
    setScreen('customers')
  }
  const completeJob = (customerId: string) => {
    const completedDate = todayISO()
    setCustomerRecords((current) => {
      const next = current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const currentOccurrence = occurrences.find((job) => job.date === completedDate && job.status === 'scheduled')
      if (!currentOccurrence) return record
      const completedOccurrence: JobOccurrence = { ...currentOccurrence, status: 'completed' }
      // Land on the closed occurrence's own recurring-cycle anchor rather than skipping a full cycle past
      // it, so a completed one-off reschedule can't leave a stale occurrence as the active cycle.
      const { date: nextClean, cycleDueDate: nextCycleDueDate } = getNextOccurrenceDates(currentOccurrence, record.frequency)
      const nextOccurrenceExists = occurrences.some((job) => job.date === nextClean && job.status === 'scheduled')
      const nextOccurrences = occurrences.map((job) => job.id === completedOccurrence.id ? completedOccurrence : job)
      if (!nextOccurrenceExists) nextOccurrences.push({ id: `${record.id}-${nextClean}`, customerId: record.id, date: nextClean, cycleDueDate: nextCycleDueDate, status: 'scheduled', price: currentOccurrence.price, round: currentOccurrence.round, worker: currentOccurrence.worker, generatedByCompletionOf: currentOccurrence.id })
      return { ...record, lastClean: completedDate, nextClean, cleanHistory: [...record.cleanHistory, { customerId: record.id, date: completedDate, price: currentOccurrence.price, round: currentOccurrence.round, worker: currentOccurrence.worker, event: 'completed' as const }], jobOccurrences: nextOccurrences }
      })
      return next
    })
  }
  const undoCompletion = (customerId: string) => {
    const completedDate = todayISO()
    const actionedAt = new Date().toISOString()
    setCustomerRecords((current) => current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const completedOccurrence = occurrences.find((job) => job.date === completedDate && job.status === 'completed')
      if (!completedOccurrence) return record
      const completionIndex = record.cleanHistory.findLastIndex((history) => history.event === 'completed' && history.date === completedDate)
      if (completionIndex === -1) return record
      const cleanHistory = record.cleanHistory.filter((_, index) => index !== completionIndex)
      const previousCompleted = cleanHistory.filter((history) => history.event === 'completed').sort((first, second) => second.date.localeCompare(first.date))[0]
      const nextOccurrences = occurrences
        .filter((job) => job.generatedByCompletionOf !== completedOccurrence.id)
        .map((job) => job.id === completedOccurrence.id ? { ...job, status: 'scheduled' as const } : job)
      return {
        ...record,
        lastClean: previousCompleted?.date || '',
        nextClean: completedDate,
        cleanHistory: [...cleanHistory, { customerId: record.id, date: completedDate, price: completedOccurrence.price, round: completedOccurrence.round, worker: completedOccurrence.worker, event: 'completion-undone' as const, actionedAt, actionedBy: currentUser.name }],
        jobOccurrences: nextOccurrences,
      }
    }))
  }
  const markNoAccess = (customerId: string) => {
    const failedDate = todayISO()
    const actionedAt = new Date().toISOString()
    setCustomerRecords((current) => {
      const next = current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const currentOccurrence = occurrences.find((job) => job.date === failedDate && job.status === 'scheduled')
      if (!currentOccurrence) return record
      const failedOccurrence = { ...currentOccurrence, status: 'no-access' as const }
      // Land on the closed occurrence's own recurring-cycle anchor rather than skipping a full cycle past it.
      const { date: nextClean, cycleDueDate: nextCycleDueDate } = getNextOccurrenceDates(currentOccurrence, record.frequency)
      const nextOccurrenceExists = occurrences.some((job) => job.date === nextClean && job.status === 'scheduled')
      const nextOccurrences = occurrences.map((job) => job.id === currentOccurrence.id ? failedOccurrence : job)
      if (!nextOccurrenceExists) nextOccurrences.push({ id: `${record.id}-${nextClean}`, customerId: record.id, date: nextClean, cycleDueDate: nextCycleDueDate, status: 'scheduled', price: currentOccurrence.price, round: currentOccurrence.round, worker: currentOccurrence.worker, generatedByStatusChangeOf: currentOccurrence.id })
      return { ...record, nextClean, cleanHistory: [...record.cleanHistory, { customerId: record.id, date: failedDate, scheduledDate: currentOccurrence.date, price: currentOccurrence.price, round: currentOccurrence.round, worker: currentOccurrence.worker, event: 'no-access' as const, actionedAt, actionedBy: currentUser.name }], jobOccurrences: nextOccurrences }
      })
      return next
    })
  }
  const skipJob = (customerId: string, reason: string) => {
    const skippedDate = todayISO()
    const actionedAt = new Date().toISOString()
    setCustomerRecords((current) => current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const currentOccurrence = occurrences.find((job) => job.date === skippedDate && job.status === 'scheduled')
      if (!currentOccurrence) return record
      const skippedOccurrence: JobOccurrence = { ...currentOccurrence, status: 'skipped', skipReason: reason }
      // Land on the closed occurrence's own recurring-cycle anchor rather than skipping a full cycle past it.
      const { date: nextClean, cycleDueDate: nextCycleDueDate } = getNextOccurrenceDates(currentOccurrence, record.frequency)
      const nextOccurrenceExists = occurrences.some((job) => job.date === nextClean && job.status === 'scheduled')
      const nextOccurrences = occurrences.map((job) => job.id === currentOccurrence.id ? skippedOccurrence : job)
      if (!nextOccurrenceExists) nextOccurrences.push({ id: `${record.id}-${nextClean}`, customerId: record.id, date: nextClean, cycleDueDate: nextCycleDueDate, status: 'scheduled', price: currentOccurrence.price, round: currentOccurrence.round, worker: currentOccurrence.worker, generatedByStatusChangeOf: currentOccurrence.id })
      return { ...record, nextClean, cleanHistory: [...record.cleanHistory, { customerId: record.id, date: skippedDate, scheduledDate: currentOccurrence.date, price: currentOccurrence.price, round: currentOccurrence.round, worker: currentOccurrence.worker, event: 'skipped' as const, reason, actionedAt, actionedBy: currentUser.name }], jobOccurrences: nextOccurrences }
    }))
  }
  const undoStatus = (customerId: string, status: 'skipped' | 'no-access') => {
    const today = todayISO()
    const actionedAt = new Date().toISOString()
    setCustomerRecords((current) => current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const statusOccurrence = occurrences.find((job) => job.date === today && job.status === status)
      if (!statusOccurrence) return record
      const historyIndex = record.cleanHistory.findLastIndex((history) => history.event === status && history.date === today)
      if (historyIndex === -1) return record
      const history = record.cleanHistory[historyIndex]
      const cleanHistory = record.cleanHistory.filter((_, index) => index !== historyIndex)
      const nextOccurrences = occurrences
        .filter((job) => job.generatedByStatusChangeOf !== statusOccurrence.id)
        .map((job) => job.id === statusOccurrence.id ? { ...job, status: 'scheduled' as const } : job)
      return {
        ...record,
        nextClean: today,
        // Undoing No Access puts the customer back on the round's shared schedule.
        independentSchedule: status === 'no-access' ? false : record.independentSchedule,
        cleanHistory: [...cleanHistory, { ...history, event: status === 'skipped' ? 'skip-undone' as const : 'no-access-undone' as const, date: today, actionedAt, actionedBy: currentUser.name }],
        jobOccurrences: nextOccurrences,
      }
    }))
  }
  const rescheduleJob = (customerId: string, newDate: string) => {
    const failedDate = todayISO()
    setCustomerRecords((current) => {
      const next = current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const currentOccurrence = occurrences.find((job) => job.date === failedDate && job.status === 'no-access')
      if (!currentOccurrence || newDate <= failedDate) return record
      const movedOccurrence = { ...currentOccurrence, date: newDate, status: 'scheduled' as const }
      return { ...record, nextClean: newDate, independentSchedule: true, cleanHistory: [...record.cleanHistory, { customerId: record.id, date: failedDate, price: record.price, round: record.round, worker: currentOccurrence.worker, event: 'rescheduled' as const, scheduledDate: newDate }], jobOccurrences: occurrences.map((job) => job.id === currentOccurrence.id ? movedOccurrence : job) }
      })
      return next
    })
  }
  // One-off move of a single scheduled occurrence (oldDate) to newDate. Frequency, cycle anchor and
  // future cycle dates are untouched because no new occurrences are generated and round anchors are not changed.
  const rescheduleVisitOnDate = (customerId: string, oldDate: string, newDate: string) => {
    if (!oldDate || !newDate || newDate === oldDate) return
    setCustomerRecords((current) => {
      const next = current.map((record) => {
      if (record.id !== customerId) return record
      const occurrences = getJobOccurrences(record)
      const target = occurrences.find((job) => job.date === oldDate && job.status === 'scheduled')
      if (!target) return record
      return {
        ...record,
        nextClean: record.nextClean === oldDate ? newDate : record.nextClean,
        cleanHistory: [...record.cleanHistory, { customerId: record.id, date: oldDate, price: target.price, round: record.round, worker: target.worker, event: 'rescheduled' as const, scheduledDate: newDate }],
        jobOccurrences: occurrences.map((job) => job.id === target.id ? { ...job, date: newDate } : job),
      }
      })
      return next
    })
  }
  // Moves every customer/job in the round scheduled on oldDate (not just the first match); the recurring cycle anchor is untouched.
  const rescheduleRoundVisit = (roundName: string, oldDate: string, newDate: string) => {
    if (!oldDate || !newDate || newDate === oldDate) return
    setCustomerRecords((current) => {
      const next = current.map((record) => {
      if (record.round !== roundName) return record
      const occurrences = getJobOccurrences(record)
      const targets = occurrences.filter((job) => job.date === oldDate && job.status === 'scheduled')
      if (!targets.length) return record
      const targetIds = new Set(targets.map((job) => job.id))
      const historyEntries = targets.map((target) => ({ customerId: record.id, date: oldDate, price: target.price, round: record.round, worker: target.worker, event: 'rescheduled' as const, scheduledDate: newDate }))
      return {
        ...record,
        nextClean: record.nextClean === oldDate ? newDate : record.nextClean,
        cleanHistory: [...record.cleanHistory, ...historyEntries],
        jobOccurrences: occurrences.map((job) => targetIds.has(job.id) ? { ...job, date: newDate } : job),
      }
      })
      if (!preservesCustomerSet(current, next)) {
        console.error('Round visit reschedule blocked: it would have changed round membership.')
        return current
      }
      return next
    })
  }
  // Resets the round's recurring cycle anchor and schedules every round customer from the new cycle date.
  // Customers with an explicitly independent schedule are left alone. Round membership and route order never change.
  const changeRoundCycleStartDate = (roundName: string, newDate: string) => {
    if (!newDate) return
    setCustomerRecords((current) => {
      const next = current.map((record) => {
      if (record.round !== roundName || record.independentSchedule) return record
      const occurrences = getJobOccurrences(record)
      const upcoming = occurrences.filter((job) => job.status === 'scheduled').sort((first, second) => first.date.localeCompare(second.date))[0]
      if (!upcoming || upcoming.date === newDate) return record
      return {
        ...record,
        nextClean: newDate,
        cleanHistory: [...record.cleanHistory, { customerId: record.id, date: upcoming.date, price: upcoming.price, round: record.round, worker: upcoming.worker, event: 'rescheduled' as const, scheduledDate: newDate }],
        jobOccurrences: occurrences.map((job) => job.id === upcoming.id ? { ...job, date: newDate } : job),
      }
      })
      if (!preservesCustomerSet(current, next)) {
        console.error('Cycle start change blocked: it would have changed round membership.')
        return current
      }
      return next
    })
    setRoundCycleAnchors((current) => ({ ...current, [roundName]: newDate }))
  }
  const isCustomers = screen === 'customers'
  const isRounds = screen === 'rounds'
  const isWork = screen === 'work'
  const isMore = screen === 'more'
  const isMap = screen === 'map'

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mark">KQ</div><div className="brand-copy"><strong>KQ CRM</strong><span>Kings &amp; Queens Window Cleaning</span></div><div className="header-actions"><button className="icon-button" aria-label="Messages"><Icon name="message" size={21} /><i /></button><div className="profile-menu-wrap"><button className="avatar profile-button" aria-label="Open profile menu" aria-expanded={profileMenuOpen} onClick={() => setProfileMenuOpen((open) => !open)}>{getUserInitials(currentUser)}</button>{profileMenuOpen && <div className="profile-menu" role="menu"><div className="profile-menu-heading"><span>Current user:</span><strong>{currentUser.name}</strong><small>{currentUser.role}</small></div><div className="profile-menu-divider" /><strong className="profile-menu-label">Development user switcher</strong><small className="profile-menu-note">Temporary until proper authentication is added.</small>{users.map((user) => <div className="profile-user-option" key={user.id}><button className={user.id === currentUser.id ? 'selected' : ''} role="menuitem" onClick={() => switchUser(user.id)}><span>{user.name}</span><small>{user.role}</small></button>{currentUser.role === 'Admin' && user.role === 'Worker' && <label><input type="checkbox" checked={user.showJobPrices} onChange={(event) => updateUserPriceVisibility(user.id, event.target.checked)} /> Show job prices</label>}</div>)}</div>}</div></div></header>
    <main className={`dashboard ${isCustomers || isRounds || isWork || isMore || isMap ? 'customers-screen' : ''}`}>
      {isCustomers && (importingCustomers ? <CustomerCsvImport existingCustomers={customerRecords} onImport={importCustomers} onFindLocations={findCustomerLocations} onCancel={() => setImportingCustomers(false)} onViewMap={() => { setImportingCustomers(false); openMap() }} /> : addingCustomer ? <ExtractedCustomerEditForm customer={emptyCustomer()} adding existingCustomers={customerRecords} onSave={addCustomer} onCancel={() => setAddingCustomer(false)} /> : selectedCustomer ? <ExtractedCustomerProfile customer={customerRecords.find((customer) => customer.id === selectedCustomer.id) || selectedCustomer} onBack={() => setSelectedCustomer(null)} onSave={saveCustomer} onViewMap={viewCustomerOnMap} /> : <ExtractedCustomerList customers={customerRecords} onSelect={setSelectedCustomer} onAdd={() => { setSelectedCustomer(null); setAddingCustomer(true) }} onImport={openImport} />)}
      {isRounds && (selectedRound ? <RoundDetails round={buildRoundSummaries(customerRecords).find((round) => round.name === selectedRound.name) || selectedRound} routeOrder={getRouteOrder(customerRecords)} cycleAnchorDate={roundCycleAnchors[selectedRound.name] || ''} onBack={() => setSelectedRound(null)} onOpenCustomer={(customer) => { setSelectedCustomer(customer); setScreen('customers') }} onReorder={(customerIds) => setCustomerRecords((current) => current.map((customer) => { const position = customerIds.indexOf(customer.id); return position === -1 ? customer : { ...customer, routePosition: position + 1 } }))} onRescheduleVisit={(newDate) => { const currentVisitDate = buildRoundSummaries(customerRecords).find((round) => round.name === selectedRound.name)?.nextWorkDue; rescheduleRoundVisit(selectedRound.name, currentVisitDate === 'No scheduled work' ? '' : currentVisitDate || '', newDate) }} onChangeCycleStart={(newDate) => changeRoundCycleStartDate(selectedRound.name, newDate)} onViewRoundOnMap={() => openMap()} /> : <RoundsOverview customerRecords={customerRecords} onSelect={setSelectedRound} />)}
      {isWork && <ExtractedTodaysWork customerRecords={customerRecords} user={currentUser} onComplete={completeJob} onNoAccess={markNoAccess} onReschedule={rescheduleJob} onSkip={skipJob} onUndoCompletion={undoCompletion} onUndoStatus={undoStatus} onRescheduleFuture={rescheduleVisitOnDate} onOpenCustomer={(customer) => { setSelectedCustomer(customer); setScreen('customers') }} />}
      {isMore && <ExtractedMoreMenu onNavigateWork={openWork} onOpenAccountMenu={() => { goHome(); setProfileMenuOpen(true) }} onImportCsv={openImport} />}
      {isMap && <ExtractedMapScreen customer={mapFocusCustomer} customers={customerRecords} onViewCustomer={(record) => { setMapFocusCustomer(null); setSelectedCustomer(record); setScreen('customers') }} />}
      {currentUser.role === 'Admin' && !isCustomers && !isRounds && !isWork && !isMore && !isMap && <Home customerRecords={customerRecords} onCustomers={openCustomers} onRounds={openRounds} onWork={openWork} onMap={openMap} />}
    </main>
    <nav className="bottom-nav" aria-label="Primary navigation">{currentUser.role === 'Worker' ? <button className="active" onClick={openWork}><Icon name="briefcase" size={21} /><span>Today&apos;s Work</span></button> : ([['home', 'Home'], ['users', 'Customers'], ['rounds', 'Rounds'], ['map', 'Map'], ['more', 'More']] as [IconName, string][]).map(([icon, label], index) => <button className={(isCustomers && label === 'Customers') || (isRounds && label === 'Rounds') || (isMap && label === 'Map') || (isMore && label === 'More') || (!isCustomers && !isRounds && !isMap && !isMore && index === 0) ? 'active' : ''} onClick={label === 'Customers' ? openCustomers : label === 'Rounds' ? openRounds : label === 'Home' ? goHome : label === 'Map' ? openMap : label === 'More' ? openMore : undefined} key={label}><Icon name={icon} size={21} /><span>{label}</span></button>)}</nav>
  </div>
}

export default App
