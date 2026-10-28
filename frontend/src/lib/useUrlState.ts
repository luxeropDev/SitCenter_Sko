import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Filter state persisted in the URL query string, so dashboard cards can deep-link
 * into filtered views and a page reload keeps the filters.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => {
    const out = { ...defaults } as T
    for (const k of Object.keys(defaults)) {
      const v = params.get(k)
      if (v !== null) (out as Record<string, string>)[k] = v
    }
    return out
  }, [params, defaults])
  const set = useCallback((patch: Partial<T>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '' || v === defaults[k]) next.delete(k)
        else next.set(k, String(v))
      }
      return next
    }, { replace: true })
  }, [setParams, defaults])
  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])
  return [state, set, reset] as const
}
