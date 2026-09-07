import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { formatCurrency, getCustomerCoordinates, openGoogleMapsNavigation, parseStoredCoordinates, type Customer } from './crmData'

type MapScreenProps = { customer?: Customer | null; customers?: Customer[]; onViewCustomer?: (customer: Customer) => void }

function getExactMapCoordinates(customer: Customer): [number, number] | null {
  if (!customer.locationVerified) return null
  return parseStoredCoordinates(customer)
}

export function MapScreen({ customer, customers = [], onViewCustomer }: MapScreenProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const [roundFilter, setRoundFilter] = useState('All Customers')
  const onViewCustomerRef = useRef(onViewCustomer)
  useEffect(() => { onViewCustomerRef.current = onViewCustomer })
  const focusMode = Boolean(customer)
  const focusCoords = useMemo(() => (customer ? getCustomerCoordinates(customer) : null), [customer])
  const roundNames = useMemo(() => [...new Set(customers.map((record) => record.round).filter(Boolean))].sort((first, second) => first.localeCompare(second)), [customers])
  const visibleCustomers = useMemo(() => (roundFilter === 'All Customers' ? customers : customers.filter((record) => record.round === roundFilter)), [customers, roundFilter])
  const mappedCustomers = useMemo(() => visibleCustomers.flatMap((record) => { const point = getExactMapCoordinates(record); return point ? [{ customer: record, point }] : [] }), [visibleCustomers])
  const locationRequiredCustomers = useMemo(() => visibleCustomers.filter((record) => !getExactMapCoordinates(record)), [visibleCustomers])

  useEffect(() => {
    if (!mapContainerRef.current) return
    const container = mapContainerRef.current
    const map = L.map(container, { zoomControl: true, attributionControl: true, preferCanvas: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(map)
    const buildPopup = (record: Customer, placeholderNote: string | null) => {
      const popupContent = document.createElement('div')
      popupContent.className = 'map-marker-popup'
      const nameEl = document.createElement('strong')
      nameEl.textContent = record.name
      const addressEl = document.createElement('p')
      addressEl.textContent = [record.address, record.postcode].filter(Boolean).join(', ')
      const metaEl = document.createElement('p')
      metaEl.className = 'map-popup-meta'
      metaEl.textContent = [record.round, formatCurrency(record.price), record.frequency].filter(Boolean).join(' · ')
      const actionsEl = document.createElement('div')
      actionsEl.className = 'map-popup-actions'
      const viewButton = document.createElement('button')
      viewButton.type = 'button'
      viewButton.className = 'secondary-button'
      viewButton.textContent = 'View Customer'
      viewButton.addEventListener('click', () => onViewCustomerRef.current?.(record))
      const navigateButton = document.createElement('button')
      navigateButton.type = 'button'
      navigateButton.className = 'secondary-button'
      navigateButton.textContent = 'Navigate'
      navigateButton.addEventListener('click', () => openGoogleMapsNavigation(record))
      actionsEl.append(viewButton, navigateButton)
      popupContent.append(nameEl, addressEl, metaEl)
      if (placeholderNote) {
        const noteEl = document.createElement('p')
        noteEl.className = 'map-placeholder-note'
        noteEl.textContent = placeholderNote
        popupContent.append(noteEl)
      }
      popupContent.append(actionsEl)
      return popupContent
    }
    if (focusMode && customer) {
      map.setView(focusCoords || [52.45, -1.92], focusCoords ? 18 : 12)
      if (focusCoords) L.marker(focusCoords).addTo(map).bindPopup(buildPopup(customer, customer.locationVerified ? null : 'Approximate suburb reference point (placeholder) — not confirmed to the exact address')).openPopup()
    } else {
      mappedCustomers.forEach(({ customer: record, point }) => { L.circleMarker(point, { radius: 7, weight: 1.5, color: '#142030', fillColor: '#d8b36a', fillOpacity: 0.95 }).addTo(map).bindPopup(buildPopup(record, null)) })
      if (mappedCustomers.length) map.fitBounds(L.latLngBounds(mappedCustomers.map(({ point }) => point)), { padding: [36, 36], maxZoom: 15 })
      else map.setView([52.45, -1.92], 11)
    }
    const timer = setTimeout(() => map.invalidateSize(), 100)
    return () => { clearTimeout(timer); map.remove() }
  }, [customer, focusCoords, focusMode, mappedCustomers])

  return <div className="map-screen">
    {focusMode && customer ? <div className="screen-heading"><div><p className="eyebrow">Location overview</p><h1>{customer.name}</h1><p className="subtitle">{[customer.address, customer.postcode].filter(Boolean).join(', ')}{!customer.locationVerified ? ' · Map point is an approximate suburb placeholder' : ''}</p></div></div> : <>
      <div className="screen-heading"><div><p className="eyebrow">Customer map</p><h1>Customer Map</h1><p className="subtitle">Every customer with a confirmed location, all at once.</p></div></div>
      <div className="stat-chip-grid map-stats"><div className="stat-chip"><span>Total Customers</span><strong>{visibleCustomers.length}</strong></div><div className="stat-chip"><span>Mapped Customers</span><strong>{mappedCustomers.length}</strong></div><div className="stat-chip warning"><span>Location Required</span><strong>{locationRequiredCustomers.length}</strong></div></div>
      <div className="filter-row map-filter-row"><select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)} aria-label="Filter customers on the map by round"><option>All Customers</option>{roundNames.map((name) => <option key={name}>{name}</option>)}</select></div>
    </>}
    <div ref={mapContainerRef} style={{ width: '100%', height: '480px', minHeight: '400px', border: '2px solid #29394d', borderRadius: '10px', background: '#172638', overflow: 'hidden', position: 'relative' }} />
    {!focusMode && locationRequiredCustomers.length > 0 && <section className="map-location-required" aria-labelledby="location-required-title"><div className="section-heading"><h2 id="location-required-title">Location Required</h2><span>{locationRequiredCustomers.length} {locationRequiredCustomers.length === 1 ? 'customer' : 'customers'}</span></div><p className="edit-field-hint">These customers have no confirmed coordinates, so no pin is shown — coordinates are never invented from an address alone. Add latitude/longitude to the customer record (or geocode their postcode later) to map them.</p><div className="map-customer-list">{locationRequiredCustomers.slice(0, 200).map((record) => <div className="map-customer-card" key={record.id}><div className="map-customer-main"><div className="customer-avatar">{record.name.split(' ').map((part) => part[0]).join('')}</div><div className="map-customer-info"><strong>{record.name}</strong><p>{[record.address, record.postcode].filter(Boolean).join(', ') || 'No address on record'}</p><p>{record.round || 'No round'} <span className="no-coords-pill">Location required</span></p></div></div><div className="map-customer-actions"><button type="button" className="secondary-button" onClick={() => onViewCustomer?.(record)}>View Customer</button></div></div>)}</div>{locationRequiredCustomers.length > 200 && <p className="edit-field-hint">Showing the first 200 — use the round filter above to narrow the list.</p>}</section>}
  </div>
}
