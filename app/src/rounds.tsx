import { useState } from 'react'
import { Icon } from './ui'
import {
  addFrequencyWeeks,
  buildRoundSummaries,
  type Customer,
  formatCurrency,
  formatDateUK,
  getNextScheduledDate,
  type RoundMeta,
  type RoundSummary,
  todayISO,
} from './crmData'

// Rounds screens (overview list + round details) and the shared date-picker/round-status controls.
// Extracted from App.tsx unchanged as part of the structural refactor — same props, same behaviour.

export function DatePickerField({ label, value, onChange, required = false, min }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; min?: string }) {
  return <label className="edit-field date-picker-field"><span>{label}{required && ' *'}</span><span className="date-picker-control"><span className="date-picker-value">{value ? formatDateUK(value) : 'Select a date'}</span><Icon name="calendar" size={18} /><input type="date" value={value} min={min} onChange={(event) => onChange(event.target.value)} required={required} aria-label={label} /></span></label>
}

export function RoundStatus({ status }: { status: RoundMeta['status'] }) {
  return <span className={`round-status ${status.toLowerCase().replace(' ', '-')}`}>{status}</span>
}

export function RoundsOverview({ customerRecords, onSelect }: { customerRecords: Customer[]; onSelect: (round: RoundSummary) => void }) {
  const [query, setQuery] = useState('')
  const [worker, setWorker] = useState('All workers / teams')
  const [frequency, setFrequency] = useState('All frequencies')
  const summaries = buildRoundSummaries(customerRecords)
  const filteredRounds = summaries.filter((round) => round.name.toLowerCase().includes(query.toLowerCase().trim()) && (worker === 'All workers / teams' || round.worker === worker) && (frequency === 'All frequencies' || round.mainFrequency === frequency))
  const activeCustomers = customerRecords.filter((customer) => customer.active).length
  const combinedValue = summaries.reduce((total, round) => total + round.roundValue, 0)

  return <>
    <div className="screen-heading"><div><p className="eyebrow">Route planning</p><h1>Rounds</h1><p className="subtitle">Organise recurring customer routes and team schedules.</p></div><button className="primary-button"><span>+</span> Add Round</button></div>
    <div className="round-stats"><div><span>Total rounds</span><strong>{summaries.length}</strong></div><div><span>Active customers</span><strong>{activeCustomers}</strong></div><div><span>Combined recurring value</span><strong>{formatCurrency(combinedValue)}</strong></div></div>
    <div className="round-toolbar"><label className="search-field"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search rounds" aria-label="Search rounds" /></label><div className="filter-row"><select value={worker} onChange={(event) => setWorker(event.target.value)} aria-label="Filter rounds by worker"><option>All workers / teams</option>{[...new Set(summaries.map((round) => round.worker))].map((value) => <option key={value}>{value}</option>)}</select><select value={frequency} onChange={(event) => setFrequency(event.target.value)} aria-label="Filter rounds by frequency"><option>All frequencies</option>{[...new Set(summaries.map((round) => round.mainFrequency))].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="customer-results"><span>{filteredRounds.length} rounds</span><span>Recurring routes</span></div>
    <div className="round-list">{filteredRounds.map((round) => <button className="round-card" key={round.name} onClick={() => onSelect(round)}><div className="round-card-heading"><div className="round-icon"><Icon name="rounds" size={23} /></div><div><strong>{round.name}</strong><span>{round.worker}</span></div><RoundStatus status={round.status} /></div><div className="round-card-metrics"><div><span>Customers</span><strong>{round.customerCount}</strong></div><div><span>Round value</span><strong>{formatCurrency(round.roundValue)}</strong></div><div><span>Main frequency</span><strong>{round.mainFrequency}</strong></div><div><span>Next work due</span><strong>{round.nextWorkDue === 'No scheduled work' ? round.nextWorkDue : formatDateUK(round.nextWorkDue)}</strong></div></div><span className="round-chevron"><Icon name="chevron" size={18} /></span></button>)}</div>
  </>
}

export function RoundDetails({ round, routeOrder, cycleAnchorDate, onBack, onOpenCustomer, onReorder, onRescheduleVisit, onChangeCycleStart, onViewRoundOnMap }: { round: RoundSummary; routeOrder: Map<string, number>; cycleAnchorDate: string; onBack: () => void; onOpenCustomer: (customer: Customer) => void; onReorder: (customerIds: string[]) => void; onRescheduleVisit: (newDate: string) => void; onChangeCycleStart: (newDate: string) => void; onViewRoundOnMap?: (round: RoundSummary) => void }) {
  const [reordering, setReordering] = useState(false)
  const [worker, setWorker] = useState(round.worker)
  const [message, setMessage] = useState('')
  const [visitModalOpen, setVisitModalOpen] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [cycleModalOpen, setCycleModalOpen] = useState(false)
  const [cycleDate, setCycleDate] = useState('')
  const routeCustomers = round.customers
  const moveCustomer = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= routeCustomers.length) return
    const next = [...routeCustomers]
    ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    onReorder(next.map((customer) => customer.id))
  }

  const currentVisit = round.cycle
  const visitJobs = currentVisit?.jobs || []
  const totalVisitJobs = visitJobs.length
  const completedVisitJobs = visitJobs.filter((job) => job.status === 'completed')
  const completedJobs = completedVisitJobs.length
  const remainingJobs = totalVisitJobs - completedJobs
  const scheduledValue = visitJobs.reduce((total, job) => total + job.price, 0)
  const completedValue = completedVisitJobs.reduce((total, job) => total + job.price, 0)
  const remainingValue = scheduledValue - completedValue
  const cycleProgress = totalVisitJobs ? Math.round((completedJobs / totalVisitJobs) * 100) : 0

  const currentVisitDate = round.nextWorkDue !== 'No scheduled work' ? round.nextWorkDue : ''
  // A one-off "Reschedule this visit" only ever moves currentVisitDate; the recurring cycle keeps using
  // nextCycleAnchor (or the explicitly set roundCycleAnchors override) so it never drifts with that move.
  const anchorDate = cycleAnchorDate || round.nextCycleAnchor || currentVisitDate
  const nextCycleDate = anchorDate && round.mainFrequency !== 'Not set' ? addFrequencyWeeks(anchorDate, round.mainFrequency) : ''
  const followingCycleDate = nextCycleDate && round.mainFrequency !== 'Not set' ? addFrequencyWeeks(nextCycleDate, round.mainFrequency) : ''

  const openVisitModal = () => { setVisitDate(currentVisitDate); setVisitModalOpen(true) }
  const confirmVisitReschedule = () => {
    if (!visitDate) return
    onRescheduleVisit(visitDate)
    setVisitModalOpen(false)
    setMessage(`Visit rescheduled to ${formatDateUK(visitDate)}. The recurring cycle is unchanged — next cycle stays ${nextCycleDate ? formatDateUK(nextCycleDate) : 'as planned'}.`)
  }
  const openCycleModal = () => { setCycleDate(anchorDate); setCycleModalOpen(true) }
  const confirmCycleChange = () => {
    if (!cycleDate) return
    onChangeCycleStart(cycleDate)
    setCycleModalOpen(false)
    setMessage(`Cycle start date changed to ${formatDateUK(cycleDate)}. Future cycle dates have been recalculated.`)
  }

  return <>
    <div className="round-detail-actions"><button className="back-button" onClick={onBack}><Icon name="arrow-left" size={19} /> Back to Rounds</button><div><button className="secondary-button" onClick={() => onViewRoundOnMap?.(round)}><Icon name="map" size={17} /> View round on map</button><button className="secondary-button" onClick={() => setMessage('Round editing will be connected to saved round data.')}>Edit Round</button><button className="primary-button" onClick={() => setMessage('Add customer flow is ready for customer assignment.')}>+ Add customer</button></div></div>
    {message && <p className="save-confirmation" role="status">{message}</p>}
    <div className="round-detail-heading"><div className="round-icon large"><Icon name="rounds" size={27} /></div><div><p className="eyebrow">Round details</p><h1>{round.name}</h1><p className="subtitle">{round.worker} <RoundStatus status={round.status} /></p></div></div>
    <div className="round-detail-stats"><div><span>Round value</span><strong>{formatCurrency(round.roundValue)}</strong></div><div><span>Active customers</span><strong>{round.customers.filter((customer) => customer.active).length}</strong></div><div><span>Average customer value</span><strong>{formatCurrency(round.averageValue)}</strong></div><div><span>Next work due</span><strong>{round.nextWorkDue === 'No scheduled work' ? round.nextWorkDue : formatDateUK(round.nextWorkDue)}</strong></div></div>
    <section className="round-section"><div className="round-section-heading"><h2>Current cycle</h2>{currentVisit ? <strong>{cycleProgress}% complete</strong> : <strong>No current visit</strong>}</div>{currentVisit ? <><p className="round-muted">Current visit date {formatDateUK(currentVisit.visitDate)}</p><div className="detail-progress"><i style={{ width: `${cycleProgress}%` }} /></div><div className="round-detail-stats"><div><span>Total jobs</span><strong>{totalVisitJobs}</strong></div><div><span>Jobs completed</span><strong>{completedJobs}</strong></div><div><span>Jobs remaining</span><strong>{remainingJobs}</strong></div><div><span>Total scheduled value</span><strong>{formatCurrency(scheduledValue)}</strong></div><div><span>Completed value</span><strong>{formatCurrency(completedValue)}</strong></div><div><span>Remaining value</span><strong>{formatCurrency(remainingValue)}</strong></div></div><div className="cycle-summary"><span>{completedJobs} of {totalVisitJobs} {totalVisitJobs === 1 ? 'job' : 'jobs'} completed</span><span>{formatCurrency(completedValue)} of {formatCurrency(scheduledValue)} completed <b>·</b> {formatCurrency(remainingValue)} remaining</span></div></> : <p className="round-muted">This round has no current scheduled visit.</p>}</section>
    <section className="round-section" aria-labelledby="round-scheduling-title">
      <div className="round-section-heading"><h2 id="round-scheduling-title">Scheduling</h2></div>
      <div className="round-detail-stats">
        <div><span>Current scheduled visit</span><strong>{currentVisitDate ? formatDateUK(currentVisitDate) : 'No scheduled work'}</strong></div>
        <div><span>Round frequency</span><strong>{round.mainFrequency}</strong></div>
        <div><span>Next cycle date</span><strong>{nextCycleDate ? formatDateUK(nextCycleDate) : '—'}</strong></div>
        <div><span>Following cycle date</span><strong>{followingCycleDate ? formatDateUK(followingCycleDate) : '—'}</strong></div>
      </div>
      <div className="round-controls">
        <button className="secondary-button" disabled={!currentVisitDate} onClick={openVisitModal}>Reschedule this visit</button>
        <button className="secondary-button danger-button" disabled={!anchorDate} onClick={openCycleModal}>Change cycle start date</button>
      </div>
    </section>
    <section className="round-section"><div className="round-section-heading"><h2>Round controls</h2></div><div className="round-controls"><label><span>Assign worker / team</span><select value={worker} onChange={(event) => { setWorker(event.target.value); setMessage('Worker assignment updated locally.') }}><option>Team North</option><option>Team Central</option><option>Team West</option><option>Dan &amp; Ellis</option><option>Maya Singh</option></select></label><button className={`secondary-button ${reordering ? 'selected-control' : ''}`} onClick={() => setReordering(!reordering)}>{reordering ? 'Done reordering' : 'Reorder customers'}</button><button className="secondary-button" onClick={() => setMessage('Move customer flow is ready for round assignment.')}>Move customer</button></div></section>
    <section className="round-section"><div className="round-section-heading"><h2>Customers in route order</h2><span>{routeCustomers.length} customers</span></div><div className="round-customer-list">{routeCustomers.map((customer, index) => <div className="round-customer-row" key={customer.id}><span className="route-number">{routeOrder.get(customer.id) ?? index + 1}</span><button onClick={() => onOpenCustomer(customer)}><strong>{customer.name}</strong><span>{customer.address}</span><span>Price {formatCurrency(customer.price)} <b>·</b> {customer.frequency} <b>·</b> Next {formatDateUK(getNextScheduledDate(customer))}</span></button>{reordering && <div className="reorder-buttons"><button aria-label={`Move ${customer.name} up`} onClick={() => moveCustomer(index, -1)}>↑</button><button aria-label={`Move ${customer.name} down`} onClick={() => moveCustomer(index, 1)}>↓</button></div>}</div>)}</div></section>
    {visitModalOpen && <div className="job-confirmation-backdrop"><div className="job-confirmation" role="dialog" aria-modal="true" aria-labelledby="reschedule-visit-title">
      <h2 id="reschedule-visit-title">Reschedule this visit</h2>
      <p>Moves only the current scheduled visit for <strong>{round.name}</strong>. The recurring cycle anchor is not affected — the next cycle stays <strong>{nextCycleDate ? formatDateUK(nextCycleDate) : 'as planned'}</strong>. Jobs and customers due on the current visit date will move to the new date.</p>
      <DatePickerField label="New visit date" value={visitDate} min={todayISO()} onChange={setVisitDate} required />
      <div><button className="secondary-button" onClick={() => setVisitModalOpen(false)}>Cancel</button><button className="primary-button" disabled={!visitDate} onClick={confirmVisitReschedule}>Confirm reschedule</button></div>
    </div></div>}
    {cycleModalOpen && <div className="job-confirmation-backdrop"><div className="job-confirmation" role="dialog" aria-modal="true" aria-labelledby="change-cycle-title">
      <h2 id="change-cycle-title">Change cycle start date</h2>
      <p className="cycle-warning"><Icon name="alert" size={18} /> Warning: this resets the recurring cycle anchor for <strong>{round.name}</strong>. All future cycle dates will be recalculated from the new start date using the {round.mainFrequency} frequency, and every customer on the round will be scheduled from the new date — except customers with their own independent schedule. Round membership is never changed: no customers are added or removed. This cannot be undone automatically.</p>
      <DatePickerField label="New cycle start date" value={cycleDate} onChange={setCycleDate} required />
      <div><button className="secondary-button" onClick={() => setCycleModalOpen(false)}>Cancel</button><button className="primary-button danger-button" disabled={!cycleDate} onClick={confirmCycleChange}>Yes, change cycle start date</button></div>
    </div></div>}
  </>
}

