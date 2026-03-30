import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface Reading {
  id: string; timestamp: string; voltage: number
  current: number; temperature: number; has_anomaly: boolean
  anomalies?: { rule_type: string; detail: any; alert_status: string }[]
}

export default function SensorDetail({ sensorId, onBack }: { sensorId: string; onBack: () => void }) {
  const [readings, setReadings] = useState<Reading[]>([])
  const [page, setPage] = useState(1)
  const [supForm, setSupForm] = useState(false)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    api.getSensorHistory(sensorId, undefined, undefined, page).then(d => setReadings(d.data || []))
  }, [sensorId, page])

  async function suppress() {
    await api.createSuppression(sensorId, start, end, reason)
    setSupForm(false)
    alert('Suppression created')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Sensor History</h2>
          <div className="flex gap-3">
            <button onClick={() => setSupForm(s => !s)}
              className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded transition-colors">
              + Suppression
            </button>
            <button onClick={onBack} className="text-sm text-gray-400 hover:text-white">← Back</button>
          </div>
        </div>

        {supForm && (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 space-y-3">
            <p className="text-sm font-medium">Create suppression window</p>
            <div className="flex gap-3">
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none" />
              <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none" />
              <input placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white text-sm rounded px-3 py-1.5 focus:outline-none flex-1" />
              <button onClick={suppress}
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded transition-colors">
                Save
              </button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {readings.map(r => (
            <div key={r.id} className={`flex items-center gap-4 rounded-lg px-4 py-2.5 text-sm
              ${r.has_anomaly ? 'bg-red-900/20 border border-red-800/40' : 'bg-gray-900 border border-gray-800'}`}>
              <span className="text-gray-400 text-xs w-40 shrink-0">
                {new Date(r.timestamp).toLocaleString()}
              </span>
              <span className="text-white w-24">⚡ {r.voltage != null ? Number(r.voltage).toFixed(1) : '-'}V</span>
              <span className="text-white w-24">⚡ {r.current != null ? Number(r.current).toFixed(2) : '-'}A</span>
              <span className="text-white w-24">🌡 {r.temperature != null ? Number(r.temperature).toFixed(1) : '-'}°C</span>
              {r.has_anomaly && (
                <span className="text-red-400 text-xs ml-auto">
                  {r.anomalies?.map(a => a.rule_type).join(', ')}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="text-sm text-gray-400 hover:text-white disabled:opacity-30">← Prev</button>
          <span className="text-sm text-gray-500">Page {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={readings.length < 100}
            className="text-sm text-gray-400 hover:text-white disabled:opacity-30">Next →</button>
        </div>
      </div>
    </div>
  )
}
