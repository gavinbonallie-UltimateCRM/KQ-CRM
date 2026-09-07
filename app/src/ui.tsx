import type { ReactNode } from 'react'

// Reusable SVG icon set. Extracted from App.tsx unchanged (structural refactor only).

export type IconName = 'users' | 'pound' | 'calendar' | 'check' | 'alert' | 'door' | 'user-plus' | 'message' | 'home' | 'rounds' | 'map' | 'more' | 'briefcase' | 'sparkle' | 'chevron' | 'search' | 'arrow-left' | 'phone' | 'mail' | 'pin' | 'navigation' | 'paperclip' | 'settings' | 'logout'

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.2 2.3-5 6-5s6 1.8 6 5" /><path d="M16 5.5a3 3 0 0 1 0 5.8M18 15.2c1.8.7 3 2.2 3 4.8" /></>,
    pound: <><path d="M14 5a4 4 0 1 0-6.9 2.8c1.2 1.3 1.4 2.7.4 5.2" /><path d="M5 13h9M4 18h12" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m8 15 2 2 5-5" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    alert: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17.5v.1" /></>,
    door: <><path d="M5 21V4a2 2 0 0 1 2-2h10v19M3 21h18M12 12h.1" /></>,
    'user-plus': <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.4-3.5 2.5-5.5 6.5-5.5s6.1 2 6.5 5.5M18 8v6M15 11h6" /></>,
    message: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-4-.9L3 20l1.5-4A7.3 7.3 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" /><path d="M8 12h.1M12 12h.1M16 12h.1" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3V10Z" /><path d="M9 20v-6h6v6" /></>,
    rounds: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2M4 5 2.5 3.5M20 5l1.5-1.5" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" /></>,
    sparkle: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3ZM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    'arrow-left': <><path d="M19 12H5M12 19l-7-7 7-7" /></>,
    phone: <path d="M6.5 3.5 9 8l-2 1.8c1 2.2 2.6 3.8 4.8 4.8l1.8-2 4.5 2.5-.7 3.2c-.2 1-1.1 1.7-2.1 1.7C8.8 20 4 15.2 4 8.7c0-1 .7-1.9 1.7-2.1l.8-3.1Z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.3" /></>,
    navigation: <><path d="m4 4 16 7-7 3-3 7-6-17Z" /><path d="m10 14 3 3" /></>,
    paperclip: <path d="m20.5 11.5-8.9 8.9a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />,
    settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.4M12 18.6V21M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M3 12h2.4M18.6 12H21M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" /></>,
    logout: <><path d="M9.5 21h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></>,
  }
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
