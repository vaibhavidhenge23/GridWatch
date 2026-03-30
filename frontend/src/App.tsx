import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AlertsPanel from './pages/AlertsPanel'
import SensorDetail from './pages/SensorDetail'
import './index.css'

function App() {
  const { user } = useAuth()
  const [page, setPage] = useState<'dashboard' | 'alerts' | 'sensor'>('dashboard')
  const [selectedSensor, setSelectedSensor] = useState<string | null>(null)

  if (!user) return <Login />
  if (page === 'alerts') return <AlertsPanel onBack={() => setPage('dashboard')} />
  if (page === 'sensor' && selectedSensor)
    return <SensorDetail sensorId={selectedSensor} onBack={() => setPage('dashboard')} />
  return (
    <Dashboard
      onSelectSensor={(id) => { setSelectedSensor(id); setPage('sensor') }}
      onAlerts={() => setPage('alerts')}
    />
  )
}

export default function Root() {
  return <AuthProvider><App /></AuthProvider>
}