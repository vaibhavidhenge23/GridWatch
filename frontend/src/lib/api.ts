const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function getToken() {
  return localStorage.getItem('token')
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export const api = {
  login: (email: string, password: string) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  getSensors: () => req('/sensors'),

  getAlerts: (page = 1) => req(`/alerts?page=${page}`),

  transitionAlert: (id: string, status: string, note?: string) =>
    req(`/alerts/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    }),

  getSensorHistory: (id: string, from?: string, to?: string, page = 1) => {
    const params = new URLSearchParams({ page: String(page) })
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    return req(`/sensors/${id}/history?${params}`)
  },

  createSuppression: (sensor_id: string, start_time: string, end_time: string, reason?: string) =>
    req('/suppression', {
      method: 'POST',
      body: JSON.stringify({ sensor_id, start_time, end_time, reason }),
    }),
}
