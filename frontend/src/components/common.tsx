import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, RefreshCw, FlaskConical, ChevronLeft, ChevronRight, Activity, Minus, ArrowUpRight, ArrowDownRight, ArrowRight, SlidersHorizontal, X } from 'lucide-react'
import { Badge, StatusIndicator } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, Drawer } from '@/components/ui/dialog'
import { Tip } from '@/components/ui/tooltip'
import { useI18n, type TKey } from '@/lib/i18n'
import { cn, fmtNum, riskTone } from '@/lib/utils'
import type { Factor, Forecast, RiskCurrent } from '@/lib/types'

/* ------------------------------------------------------------------ layout */

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-fg-subtle">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
          {it.to ? <Link to={it.to} className="hover:text-fg">{it.label}</Link> : <span className="text-fg-muted" aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

export function PageHeader({ title, subtitle, actions, eyebrow, breadcrumbs }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode; breadcrumbs?: { label: string; to?: string }[] }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
        {eyebrow ? <div className="mb-1.5 flex flex-wrap items-center gap-2">{eyebrow}</div> : null}
        <h1 className="text-balance text-[26px] font-semibold leading-tight tracking-[-0.02em] text-fg sm:text-[30px]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-[14px] text-fg-subtle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

/** KPI tile: real value, icon, status line, optional link to a filtered page. */
export function StatCard({ icon: Icon, label, value, sub, tone = 'accent', to, loading, hint, className }: {
  icon: typeof Activity; label: string; value: ReactNode; sub?: ReactNode; tone?: 'high' | 'medium' | 'low' | 'accent' | 'neutral'; to?: string; loading?: boolean; hint?: string; className?: string
}) {
  const toneCls = { high: 'text-risk-high bg-risk-high-soft', medium: 'text-risk-medium bg-risk-medium-soft', low: 'text-risk-low bg-risk-low-soft', accent: 'text-accent bg-accent-soft', neutral: 'text-fg-muted bg-surface-2' }[tone]
  const body = (
    <div className="flex h-full items-start gap-3.5 p-4 sm:p-5">
      <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', toneCls)}><Icon className="size-5" aria-hidden /></div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[13px] text-fg-subtle">{label}{hint ? <Tip content={hint}><span className="cursor-help underline decoration-dotted underline-offset-2">?</span></Tip> : null}</p>
        {loading ? <div className="skeleton mt-1 h-7 w-20 rounded" /> : <p className="truncate text-[28px] font-semibold leading-tight tracking-tight tnum">{value}</p>}
        {sub ? <div className="mt-0.5 text-xs text-fg-subtle">{sub}</div> : null}
      </div>
      {to ? <ArrowRight className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" aria-hidden /> : null}
    </div>
  )
  if (to) return <Link to={to} className={cn('group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', className)}><Card interactive className="h-full">{body}</Card></Link>
  return <Card className={cn('h-full', className)}>{body}</Card>
}

export function ChartContainer({ title, description, actions, children, className, footer }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4 pb-2">
        <div className="min-w-0"><h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>{description ? <p className="text-[13px] text-fg-subtle">{description}</p> : null}</div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="min-w-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-4">{children}</div>
      {footer ? <div className="border-t border-border px-5 py-2.5 text-xs text-fg-subtle">{footer}</div> : null}
    </Card>
  )
}

/** Inline filter row on ≥ sm, collapsible drawer with a count badge on phones. */
export function FilterBar({ children, trailing, activeCount = 0, onReset }: { children: ReactNode; trailing?: ReactNode; activeCount?: number; onReset?: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="hidden flex-wrap items-center gap-2 sm:flex">{children}</div>
      <Button variant="secondary" size="sm" className="sm:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal />{t('filter')}{activeCount ? <Badge variant="accent">{activeCount}</Badge> : null}
      </Button>
      {activeCount > 0 && onReset ? <Button variant="ghost" size="sm" onClick={onReset}><X />{t('filters_reset')}</Button> : null}
      {trailing ? <div className="ml-auto flex items-center gap-2">{trailing}</div> : null}
      <Drawer open={open} onOpenChange={setOpen} title={t('filter')} side="bottom" footer={<div className="flex justify-end gap-2">{onReset ? <Button variant="ghost" onClick={() => { onReset(); setOpen(false) }}>{t('filters_reset')}</Button> : null}<Button onClick={() => setOpen(false)}>{t('apply')}</Button></div>}>
        <div className="flex flex-col gap-3 [&>*]:w-full [&_select]:w-full [&_input]:w-full">{children}</div>
      </Drawer>
    </div>
  )
}

/* ----------------------------------------------------------------- badges */

export function RiskBadge({ level, score, className, size = 'sm' }: { level?: string | null; score?: number | null; className?: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n()
  const tone = riskTone(level)
  const label = t((`risk_${level ?? 'unknown'}` as TKey)) || level
  const Icon = tone === 'high' ? AlertTriangle : tone === 'medium' ? Activity : Minus
  return (
    <Badge variant={tone} size={size} className={className} aria-label={`${t('risk_index')}: ${label}${score != null ? ` ${fmtNum(score, 0)}` : ''}`}>
      <Icon className={cn('size-3', size === 'md' && 'size-3.5')} aria-hidden />
      <span>{label}</span>
      {score !== undefined && score !== null ? <span className="tnum font-semibold">{fmtNum(score, 0)}</span> : null}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const variant = status === 'online' ? 'low' : status === 'maintenance' ? 'medium' : 'unknown'
  return <Badge variant={variant}>{t((`status_${status}` as TKey))}</Badge>
}

export function ConnectionDot({ connection, latency }: { connection: string; latency?: number | null }) {
  const { t } = useI18n()
  const tone = connection === 'connected' ? 'low' : connection === 'delayed' ? 'medium' : connection === 'disconnected' ? 'high' : 'unknown'
  return (
    <Tip content={`${t((`conn_${connection}` as TKey))}${latency != null ? ` · ${fmtNum(latency, 0)} ${t('seconds_short')}` : ''}`}>
      <span><StatusIndicator tone={tone} label={t((`conn_${connection}` as TKey))} /></span>
    </Tip>
  )
}

export function AlertStatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const v = status === 'new' ? 'high' : status === 'acknowledged' ? 'accent' : 'success'
  return <Badge variant={v}>{t((`alert_${status}` as TKey))}</Badge>
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <RiskBadge level={severity} />
}

/* ------------------------------------------------------------------ states */

export function EmptyState({ title, text, icon, action, compact }: { title: string; text?: string; icon?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 text-center', compact ? 'py-6' : 'py-12')}>
      <div className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-medium text-fg">{title}</p>
      {text ? <p className="max-w-sm text-[13px] text-fg-subtle">{text}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry, title }: { message?: string; onRetry?: () => void; title?: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-risk-high/30 bg-risk-high-soft/40 px-6 py-8 text-center" role="alert">
      <div className="flex size-10 items-center justify-center rounded-full bg-risk-high-soft text-risk-high"><AlertTriangle className="size-5" /></div>
      <p className="text-sm font-medium">{title ?? t('error_generic')}</p>
      {message ? <p className="max-w-md text-[13px] text-fg-subtle">{message}</p> : null}
      {onRetry ? <Button variant="secondary" size="sm" className="mt-1" onClick={onRetry}><RefreshCw />{t('retry')}</Button> : null}
    </div>
  )
}

export function SyntheticBanner({ compact }: { compact?: boolean }) {
  const { t } = useI18n()
  if (compact) {
    return (
      <Tip content={t('synthetic_note')}>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-[11px] font-medium text-fg-muted"><FlaskConical className="size-3" />{t('synthetic_badge')}</span>
      </Tip>
    )
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-muted">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
      <span>{t('synthetic_note')} {t('heuristic_disclaimer')}</span>
    </div>
  )
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-fg-subtle">
      <span>{t('page')} {page} {t('of')} {pages} · {total} {t('rows')}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="iconSm" aria-label={t('prev')} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
        <Button variant="ghost" size="iconSm" aria-label={t('next')} disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, danger, onConfirm, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; children?: ReactNode
}) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        {children}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button variant={danger ? 'danger' : 'default'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onOpenChange(false) } finally { setBusy(false) } }}>{confirmLabel ?? t('confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* -------------------------------------------------------------------- risk */

export function FactorBars({ factors }: { factors: Factor[] }) {
  const { t, pick } = useI18n()
  return (
    <ul className="flex flex-col gap-2.5">
      {factors.map((f) => {
        const pct = f.normalized === null ? 0 : Math.round(f.normalized * 100)
        const tone = f.normalized === null ? 'bg-risk-unknown' : f.normalized >= 0.66 ? 'bg-risk-high' : f.normalized >= 0.33 ? 'bg-risk-medium' : 'bg-risk-low'
        return (
          <li key={f.key} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-fg">{pick(f.label)}</span>
              <span className="tnum text-fg-muted">
                {f.value !== null ? `${fmtNum(f.value, 1)} ${f.unit}` : '—'}
                <Tip content={`${t('weight')} ${f.weight} · ${t('contribution')} ${fmtNum(f.contribution, 1)}`}><span className="ml-2 cursor-help text-fg-subtle">+{fmtNum(f.contribution, 0)}</span></Tip>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={pick(f.label)}>
              <div className={cn('h-full rounded-full transition-[width] duration-(--duration-slow)', tone)} style={{ width: `${pct}%` }} />
            </div>
            {pick(f.note) ? <p className="mt-0.5 text-[11px] text-fg-subtle">{pick(f.note)}</p> : null}
          </li>
        )
      })}
    </ul>
  )
}

export function TrendLine({ trend }: { trend?: RiskCurrent['trend'] | null }) {
  const { t } = useI18n()
  if (!trend || !trend.available) return <span className="text-xs text-fg-subtle">{t('trend')}: {t('trend_unknown')}</span>
  const Icon = trend.direction === 'rising' ? ArrowUpRight : trend.direction === 'falling' ? ArrowDownRight : Minus
  const color = trend.direction === 'rising' ? 'text-risk-high' : trend.direction === 'falling' ? 'text-risk-low' : 'text-fg-muted'
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', color)}>
      <Icon className="size-3.5" aria-hidden />
      {t('trend')}: {t((`trend_${trend.direction}` as TKey))} {trend.slope_cm_h !== null ? `(${trend.slope_cm_h > 0 ? '+' : ''}${fmtNum(trend.slope_cm_h, 1)} cm/h)` : ''}
      {trend.accelerating ? ` · ${t('accelerating')}` : ''}
    </span>
  )
}

export function ForecastNote({ forecasts }: { forecasts?: Forecast[] }) {
  const { t } = useI18n()
  if (!forecasts || forecasts.length === 0) return null
  return (
    <ul className="flex flex-col gap-0.5 text-[11px] text-fg-subtle">
      {forecasts.map((f) => (
        <li key={f.horizon_hours}>{t('forecast_note', { h: f.horizon_hours, v: fmtNum(f.projected_level_cm, 0), lo: fmtNum(f.lower_cm, 0), hi: fmtNum(f.upper_cm, 0) })}</li>
      ))}
    </ul>
  )
}

export function RiskExplanation({ level, score, explanation, factors, trend, forecasts, quality, assessedAt, version }: {
  level: string; score: number | null; explanation: { ru?: string; kk?: string } | undefined; factors: Factor[]; trend?: RiskCurrent['trend'] | null; forecasts?: Forecast[]; quality?: RiskCurrent['data_quality'] | null; assessedAt?: string | null; version?: string
}) {
  const { t, pick } = useI18n()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <RiskBadge level={level} score={score} size="md" />
        <TrendLine trend={trend} />
      </div>
      <p className="text-sm leading-relaxed text-fg">{pick(explanation) ?? t('explain_none')}</p>
      {factors.length ? <FactorBars factors={factors} /> : null}
      <ForecastNote forecasts={forecasts} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
        {quality ? <span>{t('details_quality')}: {t((`quality_${quality.status}` as TKey)) || quality.status}{quality.freshness_seconds != null ? ` · ${fmtNum(quality.freshness_seconds, 0)} ${t('seconds_short')}` : ''}</span> : null}
        {assessedAt ? <span>{new Date(assessedAt).toLocaleTimeString()}</span> : null}
        {version ? <span>v{version}</span> : null}
      </div>
      <p className="text-[11px] italic text-fg-subtle">{t('heuristic_disclaimer')}</p>
    </div>
  )
}
