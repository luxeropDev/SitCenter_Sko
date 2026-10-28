import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { Link } from 'react-router-dom'
import { AlertTriangle, Locate } from 'lucide-react'
import type { Station } from '@/lib/types'
import { useI18n, type TKey } from '@/lib/i18n'
import { cn, fmtNum, riskTone } from '@/lib/utils'
import { RiskBadge } from '@/components/common'
import { TONE_COLORS, TONE_GLYPH, TONE_SHAPE, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/lib/mapStyle'

function markerIcon(level?: string | null, selected?: boolean, stale?: boolean) {
  const tone = riskTone(level)
  return L.divIcon({
    className: 'station-marker',
    html: `<div class="pin ${TONE_SHAPE[tone]}${selected ? ' selected' : ''}" style="background:${TONE_COLORS[tone]};${stale ? 'opacity:.55;' : ''}"><span>${TONE_GLYPH[tone]}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  })
}

function FitController({ stations, resetKey, focusId }: { stations: Station[]; resetKey: number; focusId?: number | null }) {
  const map = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (focusId) {
      const s = stations.find((x) => x.id === focusId)
      if (s) map.flyTo([s.latitude, s.longitude], Math.max(map.getZoom(), 12), { duration: 0.6 })
      return
    }
    if (!first.current && resetKey === 0) return
    first.current = false
    if (stations.length === 0) { map.setView(DEFAULT_CENTER, DEFAULT_ZOOM); return }
    const b = L.latLngBounds(stations.map((s) => [s.latitude, s.longitude] as [number, number]))
    map.fitBounds(b.pad(0.25), { maxZoom: 12, animate: resetKey > 0 })
  }, [map, resetKey, focusId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize(), 50)
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => { clearTimeout(id); ro.disconnect() }
  }, [map])
  return null
}

export function Legend({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <div className={cn('rounded-lg border border-border bg-surface/95 px-3 py-2.5 text-xs shadow-card backdrop-blur', className)}>
      <p className="mb-1.5 font-semibold text-fg">{t('map_legend')}</p>
      <ul className="flex flex-col gap-1.5">
        {(['low', 'medium', 'high', 'unknown'] as const).map((tone) => (
          <li key={tone} className="flex items-center gap-2 text-fg-muted">
            <span className={cn('inline-flex size-4 items-center justify-center text-[9px] font-bold text-white', tone === 'medium' ? 'rounded-[3px]' : tone === 'high' ? 'rotate-45 rounded-[3px]' : 'rounded-full')} style={{ background: TONE_COLORS[tone] }} aria-hidden>
              <span className={tone === 'high' ? '-rotate-45' : ''}>{TONE_GLYPH[tone]}</span>
            </span>
            {t((`risk_${tone}` as TKey))}
          </li>
        ))}
        <li className="flex items-center gap-2 text-fg-muted"><span className="inline-block size-4 rounded-full opacity-50" style={{ background: TONE_COLORS.unknown }} aria-hidden />{t('map_legend_stale')}</li>
      </ul>
    </div>
  )
}

export function StationMap({ stations, height = 420, className, focusId, selectedId, onSelect, showLegend = true, interactive = true, popups = true }: {
  stations: Station[]; height?: number | string; className?: string; focusId?: number | null; selectedId?: number | null; onSelect?: (id: number) => void; showLegend?: boolean; interactive?: boolean; popups?: boolean
}) {
  const { t, pick } = useI18n()
  const [resetKey, setResetKey] = useState(0)
  const [tileError, setTileError] = useState(false)
  const tileLoaded = useRef(false)
  const visible = useMemo(() => stations.filter((s) => !s.is_deleted), [stations])

  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-border bg-surface-2', className)} style={{ height }} role="region" aria-label={t('map_title')}>
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full" scrollWheelZoom={interactive} dragging={interactive} zoomControl={interactive} attributionControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{
            tileload: () => { tileLoaded.current = true; setTileError(false) },
            tileerror: () => { if (!tileLoaded.current) setTileError(true) },
          }}
        />
        <FitController stations={visible} resetKey={resetKey} focusId={focusId} />
        {visible.map((s) => {
          const stale = s.connection === 'disconnected' || s.connection === 'disabled' || s.risk?.risk_level === 'stale'
          return (
            <Marker key={`${s.id}-${selectedId === s.id ? 'sel' : ''}`} position={[s.latitude, s.longitude]} icon={markerIcon(s.risk?.risk_level, selectedId === s.id, stale)} alt={s.name} keyboard eventHandlers={onSelect ? { click: () => onSelect(s.id) } : undefined}>
              {popups ? (
                <Popup>
                  <div className="min-w-52">
                    <p className="font-semibold leading-tight">{s.name}</p>
                    <p className="mb-1.5 text-[11px] text-fg-subtle">{s.code} · {t((`status_${s.status}` as TKey))} · {t((`conn_${s.connection}` as TKey))}</p>
                    <RiskBadge level={s.risk?.risk_level} score={s.risk?.score} />
                    {s.risk?.explanation ? <p className="mt-1.5 text-[11px] leading-snug text-fg-muted">{String(pick(s.risk.explanation as { ru?: string; kk?: string }) ?? '')}</p> : null}
                    <ul className="mt-1.5 grid grid-cols-2 gap-x-2 text-[11px] text-fg-muted">
                      {s.latest.filter((v) => v.parameter === 'water_level_cm' || v.parameter === 'rainfall_mm_h' || v.parameter === 'water_level_rate_cm_h').map((v) => (
                        <li key={v.parameter}><span className="text-fg-subtle">{t((`param_${v.parameter}` as TKey))}:</span> <span className="tnum font-medium text-fg">{fmtNum(v.value, 1)} {v.unit}</span></li>
                      ))}
                    </ul>
                    <Link to={`/stations/${s.id}`} className="mt-2 inline-block text-xs font-medium text-accent hover:underline">{t('map_open_station')} →</Link>
                  </div>
                </Popup>
              ) : null}
            </Marker>
          )
        })}
      </MapContainer>
      {interactive ? (
        <button type="button" onClick={() => setResetKey((k) => k + 1)} aria-label={t('map_reset')} title={t('map_reset')} className="absolute left-[10px] top-[84px] z-[400] flex size-8 items-center justify-center rounded-[10px] border border-border bg-surface text-fg shadow-card hover:bg-surface-2">
          <Locate className="size-4" />
        </button>
      ) : null}
      {showLegend ? <Legend className="absolute bottom-6 left-2.5 z-[400] hidden sm:block" /> : null}
      {tileError ? (
        <div className="absolute inset-x-2 top-2 z-[400] flex items-center gap-2 rounded-md border border-risk-medium/40 bg-surface/95 px-3 py-2 text-xs text-fg shadow-raised" role="status">
          <AlertTriangle className="size-4 shrink-0 text-risk-medium" />{t('map_tile_error')}
        </div>
      ) : null}
    </div>
  )
}
