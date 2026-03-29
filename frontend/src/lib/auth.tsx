import { createContext, useContext, useState, ReactNode } from 'react'
import { api } from '../lib/api'

interface User { name: string; role: string }
interface AuthCtx {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const s = localStorage.getItem('user')
    return s ? JSON.parse(s) : null
  })

  async function login(email: string, password: string) {
    const data = await api.login(email, password)
    localStorage.setItem('token', data.token)
    const u = { name: data.name, role: data.role }
    localStorage.setItem('user', JSON.stringify(u))
    setUser(u)
  }

  function logout() {
    localStorage.clear()
    setUser(null)
  }

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>
}
