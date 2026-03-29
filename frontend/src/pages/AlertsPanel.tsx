import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface Alert {
  id: string; sensor_name: string; severity: 'warning' | 'critical'
  status: 'open' | 'acknowledged' | 'resolved'
  opened_at: string; zone_id: string; suppressed: boolean
}

const severityColor = { warning: 'text-yellow-400', critical: 'text-red-400' }
const statusColor = {
  open: 'text-red-400 bg-red-400/10',
  acknowledged: 'text-yellow-400 bg-yellow-400/10',
  resolved: 'text-green-400 bg-green-400/10',
}

const nextStatus: Record<string, string[]> = {
  open: ['acknowledged', 'resolved'],
  acknowledged: ['resolved'],
  resolved: [],
}

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  async function load(p: number) {
    setLoading(true)
    const data = await api.getAlerts(p)
    setAlerts(data)
    setLoading(false)
  }

  useEffect(() => { load(page) }, [page])

  async function transition(id: string, status: string) {
    await api.transitionAlert(id, status)
    load(page)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Alerts</h1>
          <a href="/" className="text-sm text-gray-400 hover:text-white">← Dashboard</a>
        </div>

        {loading ? <p className="text-gray-500">Loading...</p> : (
          <div className="space-y-2">
            {alerts.map(alert => (
              <div key={alert.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-xs font-medium ${severityColor[alert.severity]}`}>
                    {alert.severity.toUpperCase()}
                  </span>
                  <span className="text-sm text-white font-medium truncate">{alert.sensor_name}</span>
                  {alert.suppressed && <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">suppressed</span>}
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded ${statusColor[alert.status]}`}>
                    {alert.status}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(alert.opened_at).toLocaleString()}
                  </span>
                  {nextStatus[alert.status].map(next => (
                    <button key={next} onClick={() => transition(alert.id, next)}
                      className="text-xs bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded transition-colors">
                      {next}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {alerts.length === 0 && <p className="text-gray-500">No alerts.</p>}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="text-sm text-gray-400 hover:text-white disabled:opacity-30">← Prev</button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={alerts.length < 50}
            className="text-sm text-gray-400 hover:text-white disabled:opacity-30">Next →</button>
        </div>
      </div>
    </div>
  )
}
