export const DEFAULT_CENTER: [number, number] = [54.87, 69.16]
export const DEFAULT_ZOOM = 10

/** Marker encoding: color + shape + letter, so risk is readable without color vision. */
export const TONE_COLORS: Record<string, string> = { low: '#1f7a3e', medium: '#b25e00', high: '#c81e1e', unknown: '#6e6e73' }
export const TONE_SHAPE: Record<string, string> = { low: '', medium: 'square', high: 'diamond ring', unknown: '' }
export const TONE_GLYPH: Record<string, string> = { low: 'L', medium: 'M', high: 'H', unknown: '?' }
