import { useEffect, useState } from 'react'
import { api } from './api'

/**
 * "LIVE" is shown only when the backend reports that data is actually flowing:
 * the simulator loop is running with a live driver, or a device posted recently.
 */
export function useLive(): boolean {
  const [live, setLive] = useState(false)
  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const s = await api.simulator.status()
        const recent = s.last_event_at ? Date.now() - new Date(s.last_event_at).getTime() < Math.max(30_000, s.interval_seconds * 3000) : false
        if (active) setLive(s.state === 'running' && s.driver_alive && recent)
      } catch { if (active) setLive(false) }
    }
    void check()
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void check() }, 10_000)
    return () => { active = false; window.clearInterval(id) }
  }, [])
  return live
}
