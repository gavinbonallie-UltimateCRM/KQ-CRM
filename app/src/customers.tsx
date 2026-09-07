import { useEffect, useMemo, useState } from 'react'
import { DatePickerField } from './rounds'
import { Icon } from './ui'
import {
  buildNextCustomerReference,
  defaultCustomerValues,
  formatCurrency,
  formatDateUK,
  frequencyOptions,
  getNextScheduledDate,
  type Customer,
  notificationOptions,
  paymentOptions,
  roundOptions,
  serviceOptions,
  type Customer as CustomerRecord,
} from './crmData'

export function CustomerList({ customers, onSelect, onAdd, onImport }: { customers: Customer[]; onSelect: (customer: Customer) => void; onAdd: () => void; onImport: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('All status')
  const [round, setRound] = useState('All rounds')
  const [frequency, setFrequency] = useState('All frequencies')
  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const searchable = `${customer.name} ${customer.address} ${customer.postcode} ${customer.telephone} ${customer.id}`.toLowerCase()
    return searchable.includes(query.toLowerCase().trim()) && (status === 'All status' || (status === 'Active' ? customer.active : !customer.active)) && (round === 'All rounds' || customer.round === round) && (frequency === 'All frequencies' || customer.frequency === frequency)
  }), [customers, frequency, query, round, status])

  return <>
    <div className="screen-heading"><div><p className="eyebrow">Customer management</p><h1>Customers</h1><p className="subtitle">{customers.filter((customer) => customer.active).length} active customers</p></div><div className="heading-actions"><button className="secondary-button" onClick={onImport}>Import CSV</button><button className="primary-button" onClick={onAdd}><span>+</span> Add Customer</button></div></div>
    <div className="customer-toolbar"><label className="search-field"><Icon name="search" size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, address, phone or reference" aria-label="Search customers" /></label><div className="filter-row"><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option>All status</option><option>Active</option><option>Inactive</option></select><select value={round} onChange={(event) => setRound(event.target.value)} aria-label="Filter by round"><option>All rounds</option>{[...new Set(customers.map((customer) => customer.round))].map((value) => <option key={value}>{value}</option>)}</select><select value={frequency} onChange={(event) => setFrequency(event.target.value)} aria-label="Filter by frequency"><option>All frequencies</option>{[...new Set(customers.map((customer) => customer.frequency))].map((value) => <option key={value}>{value}</option>)}</select></div></div>
    <div className="customer-results"><span>{filteredCustomers.length} customers</span><span>Sorted by next clean</span></div>
    <div className="customer-list">{filteredCustomers.map((customer) => <button className="customer-card" key={customer.id} onClick={() => onSelect(customer)}><div className="customer-avatar">{customer.name.split(' ').map((part) => part[0]).join('')}</div><div className="customer-main"><div className="customer-name-row"><strong>{customer.name}</strong><span className={`status-pill ${customer.active ? 'active' : 'inactive'}`}>{customer.active ? 'Active' : 'Inactive'}</span></div><p>{customer.address}</p><p>{customer.postcode} <span className="dot-separator">·</span> {customer.round}</p><div className="customer-meta"><span>{customer.frequency}</span><span>{formatCurrency(customer.price)}</span><span>Next {formatDateUK(getNextScheduledDate(customer))}</span></div></div><Icon name="chevron" size={18} /></button>)}</div>
    {filteredCustomers.length === 0 && <div className="empty-state"><Icon name="search" size={24} /><strong>No customers found</strong><span>Try changing your search or filters.</span></div>}
  </>
}

export function CustomerEditForm({ customer, onSave, onCancel, adding = false, existingCustomers = [] }: { customer: Customer; onSave: (customer: Customer) => void; onCancel: () => void; adding?: boolean; existingCustomers?: Customer[] }) {
  const formRoundOptions = [...new Set([...roundOptions, customer.round].filter(Boolean))]
  const [form, setForm] = useState<CustomerRecord>({
    ...customer,
    frequency: frequencyOptions.includes(customer.frequency) ? customer.frequency : defaultCustomerValues.frequency,
    preferredDay: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'No preference'].includes(customer.preferredDay) ? customer.preferredDay : defaultCustomerValues.preferredDay,
    payment: paymentOptions.includes(customer.payment) ? customer.payment : defaultCustomerValues.payment,
    preferredNotification: notificationOptions.includes(customer.preferredNotification) ? customer.preferredNotification : defaultCustomerValues.preferredNotification,
    round: customer.round || formRoundOptions[0] || '',
  })
  const [priceInput, setPriceInput] = useState(() => customer.price ? customer.price.toFixed(2) : '')
  const [customServiceName, setCustomServiceName] = useState(() => serviceOptions.includes(customer.service) ? '' : customer.service)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!adding) return
    const nextReference = form.id || buildNextCustomerReference(existingCustomers)
    if (!form.id || form.id === '') setForm((current) => ({ ...current, id: nextReference, service: current.service || 'Window cleaning' }))
    if (!form.service && adding) setForm((current) => ({ ...current, service: 'Window cleaning' }))
  }, [adding, existingCustomers, form.id, form.service])
  useEffect(() => {
    const nextFrequency = frequencyOptions.includes(form.frequency) ? form.frequency : defaultCustomerValues.frequency
    const nextPreferredDay = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'No preference'].includes(form.preferredDay) ? form.preferredDay : defaultCustomerValues.preferredDay
    const nextPayment = paymentOptions.includes(form.payment) ? form.payment : defaultCustomerValues.payment
    const nextNotification = notificationOptions.includes(form.preferredNotification) ? form.preferredNotification : defaultCustomerValues.preferredNotification
    if (form.frequency !== nextFrequency || form.preferredDay !== nextPreferredDay || form.payment !== nextPayment || form.preferredNotification !== nextNotification) setForm((current) => ({ ...current, frequency: nextFrequency, preferredDay: nextPreferredDay, payment: nextPayment, preferredNotification: nextNotification }))
  }, [form.frequency, form.payment, form.preferredDay, form.preferredNotification])
  const update = (field: keyof Customer, value: string | number | boolean) => setForm((current) => ({ ...current, [field]: value }))
  const field = (label: string, name: keyof Customer, type = 'text', required = false) => <label className="edit-field"><span>{label}{required && ' *'}</span><input type={type} value={String(form[name])} onChange={(event) => update(name, event.target.value)} required={required} /></label>
  const selectField = (label: string, name: keyof Customer, options: string[], required = false) => <label className="edit-field"><span>{label}{required && ' *'}</span><select value={options.includes(String(form[name])) ? String(form[name]) : options[0] || ''} onChange={(event) => update(name, event.target.value)} required={required}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>
  const selectedService = serviceOptions.includes(form.service) ? form.service : 'Other'
  const priceField = <label className="edit-field"><span>Price *</span><span className="currency-input"><span className="currency-prefix">£</span><input type="text" min="0" inputMode="decimal" value={priceInput} onChange={(event) => { const value = event.target.value.replace(/[^\d.]/g, ''); setPriceInput(value); update('price', value ? Number(value) : 0) }} onBlur={() => { if (priceInput) setPriceInput(Number(priceInput).toFixed(2)) }} required /></span></label>
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const service = selectedService === 'Other' ? customServiceName.trim() : selectedService
    const requiredFields: [keyof Customer, string][] = [['name', 'Customer name'], ['id', 'Customer reference'], ['addressLine1', 'Address line 1'], ['postcode', 'Postcode'], ['round', 'Round'], ['service', 'Service'], ['price', 'Price'], ['frequency', 'Frequency'], ['nextClean', 'Next clean date']]
    const missing = requiredFields.find(([name]) => name === 'price' ? form.price <= 0 : name === 'service' ? !service : !String(form[name]).trim())
    if (missing) { setError(`${missing[1]} is required.`); return }
    const hasLatitude = Boolean(form.latitude.trim())
    const hasLongitude = Boolean(form.longitude.trim())
    if (hasLatitude !== hasLongitude) { setError('Enter both latitude and longitude, or leave both blank to use the approximate suburb reference point.'); return }
    const nextReference = form.id || buildNextCustomerReference(existingCustomers)
    const address = [form.addressLine1, form.addressLine2, form.townCity].filter(Boolean).join(', ')
    const coordinatesChanged = form.latitude.trim() !== customer.latitude || form.longitude.trim() !== customer.longitude
    const coordinateSource = hasLatitude ? (coordinatesChanged ? 'manual' : (form.coordinateSource || 'manual')) : undefined
    onSave({ ...form, id: nextReference, price: form.price, service: service || 'Window cleaning', address, latitude: form.latitude.trim(), longitude: form.longitude.trim(), locationVerified: hasLatitude, coordinateSource, geocodedPostcode: hasLatitude && coordinateSource === 'postcode' ? form.geocodedPostcode : undefined })
  }
  return <form className="edit-form" onSubmit={submit}>
    <div className="edit-heading"><div><p className="eyebrow">Customer profile</p><h1>{adding ? 'Add Customer' : 'Edit Customer'}</h1>{adding && <p className="form-version-test">FORM VERSION TEST 001</p>}<p className="subtitle">{adding ? 'Create a customer and their first scheduled job.' : 'Update the customer record locally.'}</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="edit-section"><h2>Customer details</h2><div className="edit-fields">{field('Customer name', 'name', 'text', true)}{field('Customer reference', 'id', 'text', true)}<label className="edit-field"><span>Status</span><select value={form.active ? 'Active' : 'Inactive'} onChange={(event) => update('active', event.target.value === 'Active')}><option>Active</option><option>Inactive</option></select></label>{field('Telephone', 'telephone')}{field('Alternative telephone', 'alternativeTelephone')}{field('Email', 'email', 'email')}</div></section>
    <section className="edit-section"><h2>Address</h2><p className="edit-field-hint">Latitude and longitude are stored only when manually confirmed against the exact address. Leave both blank to use the approximate suburb reference point, which is clearly labelled as a placeholder on the profile and map.</p><div className="edit-fields">{field('Address line 1', 'addressLine1', 'text', true)}{field('Address line 2', 'addressLine2')}{field('Town / city', 'townCity')}{field('Postcode', 'postcode', 'text', true)}{field('Latitude', 'latitude')}{field('Longitude', 'longitude')}</div></section>
    <section className="edit-section"><h2>Service</h2><div className="edit-fields">{selectField('Round', 'round', formRoundOptions, true)}<div className="edit-field"><span>Service *</span><select value={selectedService} onChange={(event) => { const value = event.target.value; update('service', value); if (value !== 'Other') setCustomServiceName('') }} required>{serviceOptions.map((option) => <option key={option}>{option}</option>)}</select>{selectedService === 'Other' && <label className="edit-field"><span>Custom service name</span><input value={customServiceName} onChange={(event) => setCustomServiceName(event.target.value)} required /></label>}</div>{priceField}{selectField('Frequency', 'frequency', frequencyOptions, true)}{selectField('Preferred day', 'preferredDay', ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'No preference'])}{selectField('Payment method', 'payment', paymentOptions)}{selectField('Preferred notification method', 'preferredNotification', notificationOptions)}{field('Source', 'source')}<DatePickerField label="Next clean date" value={form.nextClean} onChange={(value) => update('nextClean', value)} required /></div></section>
    <section className="edit-section"><h2>Notes</h2><div className="edit-fields full-width"><label className="edit-field"><span>General notes</span><textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} rows={3} /></label><label className="edit-field"><span>Access notes</span><textarea value={form.accessNotes} onChange={(event) => update('accessNotes', event.target.value)} rows={3} /></label><label className="edit-field"><span>Property notes</span><textarea value={form.propertyNotes} onChange={(event) => update('propertyNotes', event.target.value)} rows={3} /></label></div></section>
    <div className="edit-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">{adding ? 'Add Customer' : 'Save Changes'}</button></div>
  </form>
}
