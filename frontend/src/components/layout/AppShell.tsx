import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun, Waves, X, Languages, User as UserIcon, WifiOff, Monitor } from 'lucide-react'
import { NAV } from '@/components/layout/nav'
import { Button, IconButton } from '@/components/ui/button'
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown'
import { Tip } from '@/components/ui/tooltip'
import { StatusIndicator } from '@/components/ui/badge'
import { SyntheticBanner } from '@/components/common'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useAuth } from '@/lib/auth'
import { useI18n, type TKey } from '@/lib/i18n'
import { useTheme } from '@/lib/theme'
import { useConnection } from '@/lib/connection'
import { useLive } from '@/lib/useLive'
import { cn, fmtTime } from '@/lib/utils'

const SIDEBAR_KEY = 'urpaq.sidebar'
function readSidebar(): boolean {
  try { return localStorage.getItem(SIDEBAR_KEY) !== 'collapsed' } catch { return true }
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  const { t } = useI18n()
  return (
    <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-fg shadow-xs"><Waves className="size-5" aria-hidden /></div>
      {!collapsed ? (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight">XAVAMOS</p>
          <p className="truncate text-xs text-fg-subtle">Digital Urpaq</p>
          <p className="sr-only">{t('app_tagline')}</p>
        </div>
      ) : null}
    </div>
  )
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  return (
    <nav aria-label={t('nav_main')} className="flex flex-col gap-1">
      {NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role))).map((n) => {
        const link = (
          <NavLink
            key={n.to} to={n.to} end={n.to === '/'} onClick={onNavigate}
            className={({ isActive }) => cn(
              'group relative flex h-12 items-center gap-3.5 rounded-lg px-3.5 text-[15px] font-medium transition-[background-color,color] duration-(--duration-fast)',
              collapsed && 'justify-center px-0',
              isActive ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {({ isActive }) => (
              <>
                {isActive ? <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent" aria-hidden /> : null}
                <n.icon className="size-[22px] shrink-0" aria-hidden />
                {!collapsed ? <span className="truncate">{t(n.key)}</span> : <span className="sr-only">{t(n.key)}</span>}
              </>
            )}
          </NavLink>
        )
        return collapsed ? <Tip key={n.to} content={t(n.key)} side="right">{link}</Tip> : link
      })}
    </nav>
  )
}

function SystemStatus({ collapsed }: { collapsed?: boolean }) {
  const { t } = useI18n()
  const { online, lastSuccess, checking } = useConnection()
  const tone = checking ? 'unknown' : online ? 'low' : 'high'
  const label = checking ? t('updating') : online ? t('system_ok') : t('system_offline')
  if (collapsed) return <Tip content={`${label}${lastSuccess ? ` · ${fmtTime(lastSuccess.toISOString())}` : ''}`} side="right"><div className="flex justify-center py-2"><StatusIndicator tone={tone} label={<span className="sr-only">{label}</span>} /></div></Tip>
  return (
    <div className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-xs" role="status" aria-live="polite">
      <StatusIndicator tone={tone} label={<span className="font-medium text-fg">{label}</span>} pulse={online && !checking} />
      {lastSuccess ? <p className="mt-1 pl-3.5 text-fg-subtle tnum">{t('last_update')} {fmtTime(lastSuccess.toISOString())}</p> : null}
    </div>
  )
}

function SidebarProfile({ collapsed }: { collapsed?: boolean }) {
  const { user, logout } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  if (!user) return null
  const avatar = <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold uppercase text-accent">{user.username.slice(0, 2)}</span>
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button type="button" className={cn('flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-surface-2', collapsed && 'justify-center')} aria-label={`${user.full_name || user.username} · ${t((`role_${user.role}` as TKey))}`}>
          {avatar}
          {!collapsed ? (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium">{user.full_name || user.username}</span>
                <span className="block truncate text-xs text-fg-subtle">{t((`role_${user.role}` as TKey))}</span>
              </span>
              <ChevronDown className="size-4 text-fg-subtle" aria-hidden />
            </>
          ) : null}
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" side="top" sideOffset={8} className="w-60">
        <DropdownLabel>{user.email}</DropdownLabel>
        <DropdownItem onSelect={() => navigate('/settings')}><UserIcon />{t('nav_settings')}</DropdownItem>
        <DropdownSeparator />
        <DropdownItem danger onSelect={() => { void logout().then(() => navigate('/login')) }}><LogOut />{t('nav_logout')}</DropdownItem>
      </DropdownContent>
    </Dropdown>
  )
}

export function LanguageMenu() {
  const { lang, setLang, t } = useI18n()
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('language')}><Languages />{lang.toUpperCase()}<ChevronDown className="size-3" /></Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => setLang('ru')} className={cn(lang === 'ru' && 'bg-surface-2 font-medium')}>Русский</DropdownItem>
        <DropdownItem onSelect={() => setLang('kk')} className={cn(lang === 'kk' && 'bg-surface-2 font-medium')}>Қазақша</DropdownItem>
      </DropdownContent>
    </Dropdown>
  )
}

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme()
  const { t } = useI18n()
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('settings_theme')} title={t('settings_theme')}>{resolved === 'dark' ? <Moon /> : <Sun />}</Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem onSelect={() => setTheme('light')} className={cn(theme === 'light' && 'bg-surface-2 font-medium')}><Sun />{t('theme_light')}</DropdownItem>
        <DropdownItem onSelect={() => setTheme('dark')} className={cn(theme === 'dark' && 'bg-surface-2 font-medium')}><Moon />{t('theme_dark')}</DropdownItem>
        <DropdownItem onSelect={() => setTheme('system')} className={cn(theme === 'system' && 'bg-surface-2 font-medium')}><Monitor />{t('theme_system')}</DropdownItem>
      </DropdownContent>
    </Dropdown>
  )
}

function LiveBadge() {
  const { t } = useI18n()
  const live = useLive()
  if (!live) return null
  return (
    <Tip content={t('live_hint')}>
      <span className="hidden items-center gap-1.5 rounded-full border border-risk-low/30 bg-risk-low-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-risk-low sm:inline-flex" role="status">
        <span className="live-dot inline-block size-1.5 rounded-full bg-risk-low" aria-hidden />{t('live')}
      </span>
    </Tip>
  )
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expanded, setExpanded] = useState(readSidebar)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const loc = useLocation()
  const { online, lastSuccess } = useConnection()
  const { t } = useI18n()
  const hamburgerRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef(loc.pathname)

  // Close the mobile drawer on route change (not on first render).
  useEffect(() => {
    if (pathRef.current !== loc.pathname) { pathRef.current = loc.pathname; setMobileOpen(false) }
  }, [loc.pathname])

  // Escape closes the drawer; focus returns to the hamburger.
  useEffect(() => {
    if (!mobileOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMobileOpen(false); hamburgerRef.current?.focus() } }
    window.addEventListener('keydown', h)
    const first = drawerRef.current?.querySelector<HTMLElement>('a, button')
    first?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prevOverflow }
  }, [mobileOpen])

  // Global ⌘K / Ctrl+K opens the command palette (ignored while typing in inputs).
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); return }
      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (!typing && e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setPaletteOpen(true) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const toggleDesktop = useCallback(() => {
    setExpanded((v) => { const next = !v; try { localStorage.setItem(SIDEBAR_KEY, next ? 'expanded' : 'collapsed') } catch { /* ignore */ } return next })
  }, [])

  // One hamburger: on phones it opens the drawer, on desktop it collapses the rail.
  const onHamburger = () => { if (window.matchMedia('(min-width: 1024px)').matches) toggleDesktop(); else setMobileOpen(true) }

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:text-accent-fg">{t('skip_to_content')}</a>

      {/* Desktop sidebar */}
      <aside
        className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-(--duration-slow) ease-(--ease-standard) lg:flex', expanded ? 'w-sidebar' : 'w-sidebar-rail')}
        aria-label={t('nav_main')}
      >
        <div className={cn('flex h-topbar items-center border-b border-border', expanded ? 'gap-2 px-4' : 'justify-center px-2')}>
          <IconButton ref={hamburgerRef} label={expanded ? t('sidebar_collapse') : t('sidebar_expand')} onClick={toggleDesktop} aria-expanded={expanded} aria-controls="primary-nav" className="shrink-0">
            {expanded ? <PanelLeftClose className="size-5" /> : <Menu className="size-5" />}
          </IconButton>
          {expanded ? <Brand /> : null}
        </div>
        <div id="primary-nav" className={cn('flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4', expanded ? 'px-3' : 'px-2.5')}>
          {!expanded ? <div className="flex justify-center pb-1"><Brand collapsed /></div> : null}
          <NavList collapsed={!expanded} />
          <div className="mt-auto flex flex-col gap-3">
            <SystemStatus collapsed={!expanded} />
            {expanded ? <SyntheticBanner compact /> : null}
          </div>
        </div>
        <div className={cn('border-t border-border p-2', !expanded && 'px-1.5')}><SidebarProfile collapsed={!expanded} /></div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-[1100] lg:hidden" role="dialog" aria-modal="true" aria-label={t('nav_main')}>
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-in" onClick={() => setMobileOpen(false)} aria-hidden />
          <div ref={drawerRef} className="absolute inset-y-0 left-0 flex w-[288px] max-w-[88vw] flex-col bg-surface shadow-pop animate-slide-in-left">
            <div className="flex h-topbar items-center justify-between border-b border-border px-4">
              <Brand />
              <IconButton label={t('close')} onClick={() => { setMobileOpen(false); hamburgerRef.current?.focus() }}><X className="size-5" /></IconButton>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
              <NavList onNavigate={() => setMobileOpen(false)} />
              <div className="mt-auto flex flex-col gap-3"><SystemStatus /><SyntheticBanner compact /></div>
            </div>
            <div className="border-t border-border p-2"><SidebarProfile /></div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-topbar items-center gap-2 border-b border-border bg-surface/85 px-3 backdrop-blur-md sm:px-5">
          <IconButton ref={hamburgerRef} label={t('menu_open')} className="lg:hidden" onClick={onHamburger} aria-expanded={mobileOpen} aria-controls="primary-nav"><Menu className="size-5" /></IconButton>
          <div className="lg:hidden"><Brand collapsed /></div>
          <IconButton label={expanded ? t('sidebar_collapse') : t('sidebar_expand')} className="hidden lg:inline-flex" onClick={toggleDesktop}>{expanded ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}</IconButton>

          <button type="button" onClick={() => setPaletteOpen(true)} className="ml-1 hidden h-control-sm w-64 items-center gap-2 rounded-md border border-border bg-surface-2/70 px-3 text-left text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:bg-surface-2 md:flex" aria-label={t('cmd_open')}>
            <Search className="size-4" aria-hidden /><span className="flex-1 truncate">{t('cmd_placeholder')}</span>
            <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">⌘K</kbd>
          </button>
          <IconButton label={t('cmd_open')} className="md:hidden" onClick={() => setPaletteOpen(true)}><Search className="size-5" /></IconButton>

          <div className="ml-auto flex items-center gap-1">
            <LiveBadge />
            <LanguageMenu />
            <ThemeToggle />
          </div>
        </header>
        {!online ? (
          <div className="flex items-center gap-2 border-b border-risk-medium/40 bg-risk-medium-soft px-4 py-2 text-xs text-risk-medium" role="alert">
            <WifiOff className="size-3.5" />{t('connection_lost', { t: lastSuccess ? fmtTime(lastSuccess.toISOString()) : '—' })}
          </div>
        ) : null}
        <main id="main" className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7" tabIndex={-1}>
          <div className="mx-auto w-full max-w-[1560px]">{children ?? <Outlet />}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
