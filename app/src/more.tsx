import { useState } from 'react'
import { Icon, type IconName } from './ui'

export function MoreMenu({ onNavigateWork, onOpenAccountMenu, onImportCsv }: { onNavigateWork: () => void; onOpenAccountMenu: () => void; onImportCsv: () => void }) {
  const [message, setMessage] = useState('')
  const items: { label: string; icon: IconName; onClick: () => void }[] = [
    { label: "Today's Work", icon: 'briefcase', onClick: onNavigateWork },
    { label: 'Import Customers (CSV)', icon: 'user-plus', onClick: onImportCsv },
    { label: 'Workers / Teams', icon: 'users', onClick: () => setMessage('Workers / Teams is coming soon.') },
    { label: 'Messages', icon: 'message', onClick: () => setMessage('Messages is coming soon.') },
    { label: 'Leads', icon: 'user-plus', onClick: () => setMessage('Leads is coming soon.') },
    { label: 'Customer Issues', icon: 'alert', onClick: () => setMessage('Customer Issues is coming soon.') },
    { label: 'No Access / Jobs to Reschedule', icon: 'door', onClick: onNavigateWork },
    { label: 'Settings', icon: 'settings', onClick: () => setMessage('Settings is coming soon.') },
    { label: 'Log out', icon: 'logout', onClick: onOpenAccountMenu },
  ]
  return <>
    <div className="screen-heading"><div><p className="eyebrow">Menu</p><h1>More</h1><p className="subtitle">Quick access to everything else in KQ CRM.</p></div></div>
    {message && <p className="save-confirmation" role="status">{message}</p>}
    <div className="more-list">{items.map((item) => <button className="more-item" key={item.label} onClick={item.onClick}><span className="more-item-icon"><Icon name={item.icon} size={20} /></span><strong>{item.label}</strong><Icon name="chevron" size={18} /></button>)}</div>
  </>
}
