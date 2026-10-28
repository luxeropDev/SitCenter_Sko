import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'insufficient_data' | 'stale'

export const riskOrder: Record<string, number> = { high: 3, medium: 2, low: 1, stale: 0, insufficient_data: 0 }

export function riskTone(level?: string | null): 'low' | 'medium' | 'high' | 'unknown' {
  if (level === 'low' || level === 'medium' || level === 'high') return level
  return 'unknown'
}

export function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v)
}

export function fmtDateTime(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'medium', ...opts }).format(d)
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d)
}

export function fmtShortTime(iso: string | number | Date): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(d)
}

export function fmtAgo(iso: string | null | undefined, lang: 'ru' | 'kk'): string {
  if (!iso) return '—'
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  const ru = lang === 'ru'
  if (sec < 60) return ru ? `${sec} с назад` : `${sec} с бұрын`
  const min = Math.round(sec / 60)
  if (min < 60) return ru ? `${min} мин назад` : `${min} мин бұрын`
  const h = Math.round(min / 60)
  if (h < 48) return ru ? `${h} ч назад` : `${h} сағ бұрын`
  const d = Math.round(h / 24)
  return ru ? `${d} дн назад` : `${d} күн бұрын`
}

export function unitLabel(parameter: string): string {
  return { water_level_cm: 'cm', water_level_rate_cm_h: 'cm/h', rainfall_mm_h: 'mm/h', soil_moisture_pct: '%', air_temperature_c: '°C' }[parameter] ?? ''
}

export const PARAMETERS = ['water_level_cm', 'water_level_rate_cm_h', 'rainfall_mm_h', 'soil_moisture_pct', 'air_temperature_c'] as const
export type Parameter = (typeof PARAMETERS)[number]

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}
