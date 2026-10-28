import { useEffect, useState } from 'react'
import { getRefreshMs } from './connection'

export function useRefreshMs(): number {
  const [ms, setMs] = useState(getRefreshMs)
  useEffect(() => {
    const h = () => setMs(getRefreshMs())
    window.addEventListener('urpaq-refresh-changed', h)
    return () => window.removeEventListener('urpaq-refresh-changed', h)
  }, [])
  return ms
}
