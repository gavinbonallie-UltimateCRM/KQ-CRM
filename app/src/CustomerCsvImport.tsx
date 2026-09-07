import { useMemo, useRef, useState } from 'react'
import type { Customer } from './crmData'
import { analyzeRows, IMPORT_FIELDS, parseCsv, suggestMapping } from './csvImport'
import type { AnalyzedRow, ColumnMapping, ImportFieldKey } from './csvImport'
import type { LocationLookupSummary } from './postcodeLocations'

type ImportStep = 'select' | 'review' | 'done'

type ImportSummary = {
  imported: number
  mapped: number
  locationRequired: number
}

function rowStatus(row: AnalyzedRow): { label: string; tone: 'ready' | 'warning' | 'error' } {
  if (!row.importable) return { label: 'Invalid', tone: 'error' }
  if (row.duplicateOf) return { label: 'Duplicate', tone: 'error' }
  if (row.issues.some((issue) => issue.startsWith('Missing'))) return { label: 'Missing info', tone: 'warning' }
  return row.coords ? { label: 'Ready · mapped', tone: 'ready' } : { label: 'Ready · location required', tone: 'warning' }
}

// Builds a customer record from one importable CSV row. Scheduling fields are deliberately left empty
// (no job occurrences, no next-clean date): importing customers must never create or move any work.
function buildCustomer(row: AnalyzedRow): Customer {
  const { fields } = row
  return {
    id: '', // assigned by the App import handler
    routePosition: 0, // assigned by the App import handler
    name: fields.name,
    address: [fields.addressLine1, fields.addressLine2, fields.townCity].filter(Boolean).join(', '),
    postcode: fields.postcode,
    telephone: fields.telephone,
    alternativeTelephone: '',
    email: fields.email,
    addressLine1: fields.addressLine1,
    addressLine2: fields.addressLine2,
    townCity: fields.townCity,
    round: fields.round,
    service: 'Window cleaning',
    price: row.price,
    frequency: row.frequency,
    nextClean: '',
    active: true,
    preferredDay: 'No preference',
    payment: 'Direct debit',
    preferredNotification: 'SMS/Text',
    source: 'CSV import',
    notes: '',
    accessNotes: '',
    propertyNotes: '',
    latitude: row.coords ? String(row.coords[0]) : '',
    longitude: row.coords ? String(row.coords[1]) : '',
    // A valid coordinate pair from the customer's own file is trusted and pinned on the map. Rows
    // without one keep blank coordinates and show as Location Required — no point is ever invented.
    locationVerified: Boolean(row.coords),
    coordinateSource: row.coords ? 'csv' : undefined,
    lastClean: '',
    cleanHistory: [],
    jobOccurrences: [],
  }
}

export function CustomerCsvImport({ existingCustomers, onImport, onFindLocations, onCancel, onViewMap }: { existingCustomers: Customer[]; onImport: (customers: Customer[]) => void; onFindLocations: () => Promise<LocationLookupSummary>; onCancel: () => void; onViewMap?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ImportStep>('select')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [findingLocations, setFindingLocations] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')

  const analysis = useMemo(() => (dataRows.length ? analyzeRows(dataRows, mapping, existingCustomers) : null), [dataRows, mapping, existingCustomers])
  const previewRows = useMemo(() => (analysis ? analysis.rows.slice(0, 8) : []), [analysis])

  const handleFile = async (file: File) => {
    setError('')
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length < 2) {
        setError('That file has a header row but no customer rows. Please choose a CSV with at least one row of data.')
        return
      }
      setFileName(file.name)
      setHeaders(parsed[0])
      setDataRows(parsed.slice(1))
      setMapping(suggestMapping(parsed[0]))
      setStep('review')
    } catch {
      setError('Could not read that file. Please choose a valid CSV file.')
    }
  }

  const reset = () => {
    setStep('select')
    setFileName('')
    setHeaders([])
    setDataRows([])
    setMapping({})
    setError('')
    setSummary(null)
  }

  const updateMapping = (field: ImportFieldKey, value: string) => {
    setMapping((current) => {
      const next = { ...current }
      if (value === '') delete next[field]
      else next[field] = Number(value)
      return next
    })
  }

  const confirmImport = () => {
    if (!analysis) return
    const readyRows = analysis.rows.filter((row) => row.importable && !row.duplicateOf)
    if (!readyRows.length) return
    onImport(readyRows.map(buildCustomer))
    setSummary({ imported: readyRows.length, mapped: readyRows.filter((row) => row.coords).length, locationRequired: readyRows.filter((row) => !row.coords).length })
    setStep('done')
  }

  const findLocations = async () => {
    setFindingLocations(true)
    setLocationMessage('')
    try {
      const result = await onFindLocations()
      setSummary((current) => current ? { ...current, mapped: current.mapped + result.matched, locationRequired: Math.max(0, current.locationRequired - result.matched) } : current)
      const failedMessage = result.failed ? ` ${result.failed} postcode${result.failed === 1 ? '' : 's'} still require a location.` : ''
      setLocationMessage(`${result.matched} customer${result.matched === 1 ? '' : 's'} mapped.${failedMessage}${result.error ? ` ${result.error}` : ''}`)
    } finally {
      setFindingLocations(false)
    }
  }

  if (step === 'done' && summary) {
    return <>
      <div className="screen-heading"><div><p className="eyebrow">Customer CSV import</p><h1>Import complete</h1><p className="subtitle">{fileName}</p></div></div>
      <p className="save-confirmation" role="status">Imported {summary.imported} {summary.imported === 1 ? 'customer' : 'customers'}.</p>
      <div className="stat-chip-grid import-stats">
        <div className="stat-chip"><span>Imported</span><strong>{summary.imported}</strong></div>
        <div className="stat-chip"><span>Mapped Customers</span><strong>{summary.mapped}</strong></div>
        <div className="stat-chip warning"><span>Location Required</span><strong>{summary.locationRequired}</strong></div>
      </div>
      <p className="edit-field-hint">Customers with coordinates from your file are pinned on the map. Customers without coordinates are marked Location Required — no locations were invented from addresses.</p>
      {locationMessage && <p className="save-confirmation" role="status">{locationMessage}</p>}
      <div className="edit-actions">
        <button type="button" className="secondary-button" disabled={findingLocations} onClick={() => void findLocations}>{findingLocations ? 'Finding Locations…' : 'Find Locations'}</button>
        <button type="button" className="secondary-button" onClick={onCancel}>View Customers</button>
        {onViewMap && <button type="button" className="primary-button" onClick={onViewMap}>View Map</button>}
      </div>
      <button type="button" className="text-button" onClick={reset}>Import another CSV</button>
    </>
  }

  if (step === 'review' && analysis) {
    const importDisabled = !analysis.importableRows || mapping.name === undefined
    return <>
      <button type="button" className="back-button" onClick={reset}>&lsaquo; Choose a different file</button>
      <div className="screen-heading"><div><p className="eyebrow">Customer CSV import</p><h1>Review import</h1><p className="subtitle">{fileName} · {analysis.totalRows} data {analysis.totalRows === 1 ? 'row' : 'rows'} found</p></div></div>
      {mapping.name === undefined && <p className="form-error" role="alert">Map the Customer name column to continue — a customer cannot be created without a name.</p>}
      <section className="edit-section">
        <h2>Column mapping</h2>
        <p className="edit-field-hint">Match each CRM field to a column from your file. The headers were read from the first row; change any match that looks wrong. Fields left as &ldquo;Not imported&rdquo; are skipped.</p>
        <div className="edit-fields">
          {IMPORT_FIELDS.map((field) => <label className="edit-field" key={field.key}><span>{field.label}{field.optional ? '' : ''}</span><select value={mapping[field.key] ?? ''} onChange={(event) => updateMapping(field.key, event.target.value)}><option value="">— Not imported —</option>{headers.map((header, index) => <option key={index} value={index}>{header.trim() || `Column ${index + 1}`}</option>)}</select></label>)}
        </div>
      </section>
      <div className="stat-chip-grid import-stats">
        <div className="stat-chip"><span>Total rows</span><strong>{analysis.totalRows}</strong></div>
        <div className="stat-chip"><span>Valid rows</span><strong>{analysis.importableRows}</strong></div>
        <div className="stat-chip"><span>Duplicates</span><strong>{analysis.duplicateRows}</strong></div>
        <div className="stat-chip"><span>Missing address/postcode</span><strong>{analysis.missingAddressRows}</strong></div>
        <div className="stat-chip"><span>Invalid rows</span><strong>{analysis.invalidRows}</strong></div>
        <div className="stat-chip warning"><span>Location Required</span><strong>{analysis.locationRequired}</strong></div>
      </div>
      <section className="edit-section">
        <h2>Preview</h2>
        <p className="edit-field-hint">Rows with a valid latitude and longitude are pinned on the map ({analysis.withCoordinates}). Rows without coordinates are imported and marked Location Required ({analysis.locationRequired}) — coordinates are never made up from an address. Duplicates and invalid rows are skipped.</p>
        <div className="import-preview-scroll">
          <table className="import-preview-table">
            <thead><tr><th>Row</th><th>Name</th><th>Address</th><th>Postcode</th><th>Round</th><th>Price</th><th>Frequency</th><th>Coordinates</th><th>Status</th></tr></thead>
            <tbody>
              {previewRows.map((row) => {
                const status = rowStatus(row)
                return <tr key={row.rowNumber}>
                  <td>{row.rowNumber}</td>
                  <td className="wrap">{row.fields.name || '—'}</td>
                  <td className="wrap">{[row.fields.addressLine1, row.fields.addressLine2, row.fields.townCity].filter(Boolean).join(', ') || '—'}</td>
                  <td>{row.fields.postcode || '—'}</td>
                  <td>{row.fields.round || '—'}</td>
                  <td>{row.price ? `£${row.price.toFixed(2)}` : '—'}</td>
                  <td>{row.frequency}</td>
                  <td>{row.coords ? `${row.coords[0]}, ${row.coords[1]}` : 'Location Required'}</td>
                  <td><span className={`status-pill ${status.tone === 'ready' ? 'active' : status.tone === 'warning' ? 'warning' : 'inactive'}`} title={row.duplicateOf ? `Matches existing customer: ${row.duplicateOf}` : row.issues.join('; ')}>{status.label}</span></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        {analysis.rows.length > previewRows.length && <p className="edit-field-hint">Showing the first {previewRows.length} of {analysis.rows.length} rows.</p>}
      </section>
      <div className="edit-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary-button" disabled={importDisabled} onClick={confirmImport}>Import {analysis.importableRows} {analysis.importableRows === 1 ? 'customer' : 'customers'}</button>
      </div>
    </>
  }

  return <>
    <div className="screen-heading"><div><p className="eyebrow">Customer CSV import</p><h1>Import Customers from CSV</h1><p className="subtitle">Upload a CSV of your window-cleaning customers from your phone or computer.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <input ref={fileInputRef} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = '' }} />
    <button type="button" className="import-upload" onClick={() => fileInputRef.current?.click()}>
      Choose a CSV file
      <small>First row must be headers — e.g. name, address, town/city, postcode, phone, email, round, price, frequency, latitude, longitude.</small>
    </button>
    <section className="edit-section">
      <h2>How import works</h2>
      <p className="edit-field-hint">You can check the column mapping and preview every row before anything is imported. If your file already has valid latitude/longitude, those customers are pinned on the map. If it only has addresses/postcodes, customers are imported and marked Location Required — coordinates are never invented. Duplicates of existing customers are skipped. Importing never creates jobs or touches the schedule.</p>
    </section>
    <div className="edit-actions">
      <button type="button" className="secondary-button" onClick={onCancel}>Back to Customers</button>
    </div>
  </>
}
