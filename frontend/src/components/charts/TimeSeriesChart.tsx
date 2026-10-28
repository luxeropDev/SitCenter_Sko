import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtShortTime, fmtNum, fmtDateTime } from '@/lib/utils'
import { SERIES_COLORS } from '@/lib/chartColors'
import { EmptyState } from '@/components/common'
import { useI18n } from '@/lib/i18n'

export interface SeriesDef { key: string; name: string; color?: string; dashed?: boolean; yAxisId?: 'left' | 'right'; unit?: string }
export interface RefLine { y: number; label: string; color: string }

function ChartTooltip({ active, payload, label, units }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: number; units: Record<string, string | undefined> }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-medium text-fg tnum">{fmtDateTime(new Date(label as number).toISOString())}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.filter((p) => p.value !== undefined && p.value !== null).map((p) => (
          <li key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-fg-muted"><span className="inline-block size-2 rounded-full" style={{ background: p.color }} aria-hidden />{p.name}</span>
            <span className="tnum font-medium text-fg">{fmtNum(p.value, 2)}{units[p.dataKey] ? ` ${units[p.dataKey]}` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function TimeSeriesChart({ data, series, unit, unitRight, height = 240, refLines, area, emptyText, yDomain }: {
  data: object[]; series: SeriesDef[]; unit?: string; unitRight?: string; height?: number; refLines?: RefLine[]; area?: boolean; emptyText?: string; yDomain?: [number | 'auto', number | 'auto']
}) {
  const { t } = useI18n()
  const rows = useMemo(() => (data as Record<string, unknown>[]).map((d) => ({ ...d, ts: new Date(d.t as string).getTime() })), [data])
  const units = useMemo(() => Object.fromEntries(series.map((s) => [s.key, s.unit ?? (s.yAxisId === 'right' ? unitRight : unit)])), [series, unit, unitRight])
  if (!data || data.length < 2) return <EmptyState title={emptyText ?? t('no_data_range')} compact />
  const hasRight = series.some((s) => s.yAxisId === 'right')
  const Chart = area ? AreaChart : LineChart
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Chart data={rows} margin={{ top: 8, right: hasRight ? 4 : 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="ts" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(v) => fmtShortTime(v)} minTickGap={40} tickLine={false} axisLine={false} />
        <YAxis yAxisId="left" width={44} tickLine={false} axisLine={false} domain={yDomain ?? ['auto', 'auto']} tickFormatter={(v) => fmtNum(v, 0)} label={unit ? { value: unit, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--fg-subtle)' } } : undefined} />
        {hasRight ? <YAxis yAxisId="right" orientation="right" width={40} tickLine={false} axisLine={false} tickFormatter={(v) => fmtNum(v, 0)} label={unitRight ? { value: unitRight, angle: 90, position: 'insideRight', style: { fontSize: 10, fill: 'var(--fg-subtle)' } } : undefined} /> : null}
        <Tooltip content={<ChartTooltip units={units} />} cursor={{ stroke: 'var(--border-strong)' }} />
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} /> : null}
        {refLines?.map((r) => <ReferenceLine key={r.label} yAxisId="left" y={r.y} stroke={r.color} strokeDasharray="4 4" label={{ value: r.label, position: 'insideTopRight', fontSize: 10, fill: r.color }} />)}
        {series.map((s, i) =>
          area ? (
            <Area key={s.key} yAxisId={s.yAxisId ?? 'left'} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} fill={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} fillOpacity={0.12} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
          ) : (
            <Line key={s.key} yAxisId={s.yAxisId ?? 'left'} type="monotone" dataKey={s.key} name={s.name} stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />
          ),
        )}
      </Chart>
    </ResponsiveContainer>
  )
}
