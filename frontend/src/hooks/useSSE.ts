import { useEffect } from 'react'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function useSSE(onEvent: (event: string, data: unknown) => void) {
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const es = new EventSource(`${BASE}/sensors/events?token=${token}`)

    es.addEventListener('sensor_state_change', (e) => {
      onEvent('sensor_state_change', JSON.parse(e.data))
    })
    es.addEventListener('alert_escalated', (e) => {
      onEvent('alert_escalated', JSON.parse(e.data))
    })

    return () => es.close()
  }, [])
}
