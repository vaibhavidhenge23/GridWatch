import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useSSE } from '../hooks/useSSE'
import { useAuth } from '../lib/auth'

type SensorState = 'healthy' | 'warning' | 'critical' | 'silent'
interface Sensor {
  id: string; name: string; zone_name: string
  state: SensorState; last_seen_at: string
}

const stateColors: Record<SensorState, string> = {
  healthy:  'bg-green-500',
  warning:  'bg-yellow-500',
  critical: 'bg-red-500 animate-pulse',
  silent:   'bg-gray-500',
}
const stateBadge: Record<SensorState, string> = {
  healthy:  'text-green-400 bg-green-400/10',
  warning:  'text-yellow-400 bg-yellow-400/10',
  critical: 'text-red-400 bg-red-400/10',
  silent:   'text-gray-400 bg-gray-400/10',
}

export default function Dashboard({ onSelectSensor }: { onSelectSensor: (id: string) => void }) {
  const { user, logout } = useAuth()
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [filter, setFilter] = useState<SensorState | 'all'>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.getSensors().then(setSensors)
  }, [])

  // SSE — update sensor state in-place without full refetch
  useSSE(useCallback((event, data: any) => {
    if (event === 'sensor_state_change') {
      setSensors(prev => prev.map(s =>
        s.id === data.sensorId ? { ...s, state: data.state } : s
      ))
    }
  }, []))

  const visible = sensors.filter(s =>
    (filter === 'all' || s.state === filter) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  )

  const counts = sensors.reduce((acc, s) => {
    acc[s.state] = (acc[s.state] || 0) + 1; return acc
  }, {} as Record<string, number>)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">GridWatch</h1>
          <p className="text-gray-400 text-xs">{user?.name} · {user?.role}</p>
        </div>
        <div className="flex gap-3 items-center">
          <a href="/alerts" className="text-sm text-gray-400 hover:text-white transition-colors">Alerts</a>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-white">Sign out</button>
        </div>
      </div>

      {/* Status bar */}
      <div className="px-6 py-4 flex gap-4 border-b border-gray-800">
        {(['all', 'healthy', 'warning', 'critical', 'silent'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`text-sm px-3 py-1 rounded-full transition-colors ${filter === s ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
            {s === 'all' ? `All (${sensors.length})` : `${s} (${counts[s] || 0})`}
          </button>
        ))}
        <input
          placeholder="Search sensors..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="ml-auto bg-gray-800 border border-gray-700 text-sm text-white rounded-lg px-3 py-1 focus:outline-none focus:border-blue-500 w-48"
        />
      </div>

      {/* Sensor grid */}
      <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {visible.map(sensor => (
          <button key={sensor.id} onClick={() => onSelectSensor(sensor.id)}
            className="bg-gray-900 border border-gray-800 rounded-lg p-3 text-left hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${stateColors[sensor.state]}`} />
              <span className={`text-xs px-1.5 py-0.5 rounded ${stateBadge[sensor.state]}`}>{sensor.state}</span>
            </div>
            <p className="text-xs font-medium text-white truncate">{sensor.name}</p>
            <p className="text-xs text-gray-500 truncate">{sensor.zone_name}</p>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="text-gray-500 text-sm col-span-full">No sensors match filter.</p>
        )}
      </div>
    </div>
  )
}
