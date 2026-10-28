import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api'

export interface PollState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  refreshing: boolean
  lastSuccess: Date | null
  refresh: () => void
}

/**
 * Polls `fetcher` every `intervalMs`. Guarantees: no overlapping requests, in-flight
 * request aborted on unmount, pauses when the tab is hidden, retries on focus.
 */
export function usePolling<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs: number, deps: unknown[] = [], enabled = true): PollState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSuccess, setLastSuccess] = useState<Date | null>(null)
  const [tick, setTick] = useState(0)
  const inFlight = useRef<AbortController | null>(null)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(async () => {
    if (inFlight.current) return // skip overlapping
    const ctrl = new AbortController()
    inFlight.current = ctrl
    setRefreshing(true)
    try {
      const d = await fetcherRef.current(ctrl.signal)
      if (!ctrl.signal.aborted) {
        setData(d)
        setError(null)
        setLastSuccess(new Date())
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && !ctrl.signal.aborted) setError(e instanceof ApiError ? e : new ApiError(0, 'unknown', (e as Error).message))
    } finally {
      if (inFlight.current === ctrl) inFlight.current = null
      if (!ctrl.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    setLoading(true)
    void run()
    let timer: number | undefined
    const schedule = () => {
      if (intervalMs > 0) timer = window.setInterval(() => { if (document.visibilityState === 'visible') void run() }, intervalMs)
    }
    schedule()
    const onVis = () => { if (document.visibilityState === 'visible') void run() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => {
      if (timer) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onVis)
      inFlight.current?.abort()
      inFlight.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, tick, ...deps])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, refreshing, lastSuccess, refresh }
}
