import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Bell, CornerDownLeft, Radio, Search, type LucideIcon } from 'lucide-react'
import { NAV } from '@/components/layout/nav'
import { RiskBadge } from '@/components/common'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Alert, Station } from '@/lib/types'

interface Item { id: string; group: 'nav' | 'stations' | 'alerts'; label: string; sub?: string; icon?: LucideIcon; to: string; extra?: React.ReactNode }

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  // Remount the inner palette on every open so search state starts clean without effects.
  if (!open) return null
  return <PaletteInner onOpenChange={onOpenChange} />
}

function PaletteInner({ onOpenChange }: { onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n()
  const open = true
  const { user } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    api.stations.list({ page_size: 200 }, ctrl.signal).then((p) => setStations(p.items)).catch(() => { /* keep previous */ })
    api.alerts.list({ status: 'new', page_size: 20 }, ctrl.signal).then((p) => setAlerts(p.items)).catch(() => { /* keep previous */ })
    return () => ctrl.abort()
  }, [])

  const items = useMemo<Item[]>(() => {
    const ql = q.trim().toLowerCase()
    const nav: Item[] = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role))).map((n) => ({ id: `nav:${n.to}`, group: 'nav', label: t(n.key), icon: n.icon, to: n.to }))
    const st: Item[] = stations.map((s) => ({ id: `st:${s.id}`, group: 'stations', label: s.name, sub: `${s.code} · ${t((`status_${s.status}` as TKey))}`, icon: Radio, to: `/stations/${s.id}`, extra: <RiskBadge level={s.risk?.risk_level} score={s.risk?.score} /> }))
    const al: Item[] = alerts.map((a) => ({ id: `al:${a.id}`, group: 'alerts', label: a.title, sub: a.station_name ?? undefined, icon: Bell, to: `/alerts/${a.id}`, extra: <RiskBadge level={a.severity} /> }))
    const all = [...nav, ...st, ...al]
    if (!ql) return [...nav, ...st.slice(0, 5), ...al.slice(0, 5)]
    return all.filter((i) => i.label.toLowerCase().includes(ql) || i.sub?.toLowerCase().includes(ql)).slice(0, 30)
  }, [q, stations, alerts, user, t])

  const onQuery = (v: string) => { setQ(v); setActive(0) }
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const go = (it: Item) => { onOpenChange(false); navigate(it.to) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); go(items[active]) }
  }

  const groups: { key: Item['group']; label: string }[] = [{ key: 'nav', label: t('cmd_sections') }, { key: 'stations', label: t('nav_stations') }, { key: 'alerts', label: t('cmd_alerts_new') }]
  let idx = -1

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1200] bg-black/40 backdrop-blur-[2px] animate-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-[1200] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop focus:outline-none animate-scale-in" onKeyDown={onKey}>
          <DialogPrimitive.Title className="sr-only">{t('cmd_open')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('cmd_hint')}</DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <input autoFocus value={q} onChange={(e) => onQuery(e.target.value)} placeholder={t('cmd_placeholder')} aria-label={t('cmd_placeholder')} role="combobox" aria-expanded aria-controls="cmd-list" aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
              className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-fg-subtle" />
            <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:block">Esc</kbd>
          </div>
          <ul ref={listRef} id="cmd-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
            {items.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-subtle">{t('cmd_no_results')}</li> : null}
            {groups.map((g) => {
              const gi = items.filter((i) => i.group === g.key)
              if (!gi.length) return null
              return (
                <li key={g.key} role="presentation">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{g.label}</p>
                  <ul role="group" aria-label={g.label}>
                    {gi.map((it) => {
                      idx += 1
                      const i = idx
                      const Icon = it.icon
                      return (
                        <li key={it.id} id={`cmd-${it.id}`} role="option" aria-selected={active === i} data-index={i}
                          onMouseEnter={() => setActive(i)} onClick={() => go(it)}
                          className={cn('flex h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm', active === i ? 'bg-accent-soft text-accent' : 'text-fg')}>
                          {Icon ? <Icon className={cn('size-4 shrink-0', active === i ? 'text-accent' : 'text-fg-subtle')} aria-hidden /> : null}
                          <span className="min-w-0 flex-1"><span className="block truncate font-medium">{it.label}</span>{it.sub ? <span className="block truncate text-xs text-fg-subtle">{it.sub}</span> : null}</span>
                          {it.extra}
                          {active === i ? <CornerDownLeft className="size-3.5 text-fg-subtle" aria-hidden /> : null}
                        </li>
                      )
                    })}
                  </ul>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
            <span><kbd className="font-mono">↑↓</kbd> {t('cmd_navigate')}</span><span><kbd className="font-mono">↵</kbd> {t('open')}</span><span className="ml-auto">{t('cmd_hint')}</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
