import { Activity, BarChart3, Bell, LayoutDashboard, Map as MapIcon, Radio, Settings, Shield } from 'lucide-react'
import type { TKey } from '@/lib/i18n'
import type { Role } from '@/lib/types'

export interface NavItem { to: string; key: TKey; icon: typeof LayoutDashboard; roles?: Role[] }

/** Primary navigation. Every entry maps to a real route in App.tsx. */
export const NAV: NavItem[] = [
  { to: '/', key: 'nav_overview', icon: LayoutDashboard },
  { to: '/map', key: 'nav_map', icon: MapIcon },
  { to: '/stations', key: 'nav_stations', icon: Radio },
  { to: '/alerts', key: 'nav_alerts', icon: Bell },
  { to: '/analytics', key: 'nav_analytics', icon: BarChart3 },
  { to: '/simulator', key: 'nav_simulator', icon: Activity, roles: ['operator', 'admin'] },
  { to: '/admin', key: 'nav_admin', icon: Shield, roles: ['admin'] },
  { to: '/settings', key: 'nav_settings', icon: Settings },
]
