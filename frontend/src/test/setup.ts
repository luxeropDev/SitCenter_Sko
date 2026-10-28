import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom lacks these browser APIs used by the shell, map and charts.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }),
  })
}
class RO { observe() {} unobserve() {} disconnect() {} }
if (!('ResizeObserver' in window)) Object.defineProperty(window, 'ResizeObserver', { writable: true, value: RO })
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
if (!window.HTMLElement.prototype.hasPointerCapture) window.HTMLElement.prototype.hasPointerCapture = () => false

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })
