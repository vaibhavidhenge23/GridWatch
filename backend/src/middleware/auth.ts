import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthPayload {
  operatorId: string
  role: 'operator' | 'supervisor'
  zoneIds: string[]  // populated at login from operator_zones table
}

declare global {
  namespace Express {
    interface Request { operator?: AuthPayload }
  }
}

export function auth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.operator = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Injects zone filter into every query — supervisor gets all zones
export function zoneFilter(req: Request): string[] | null {
  if (!req.operator) return []
  if (req.operator.role === 'supervisor') return null  // null = no filter = all zones
  return req.operator.zoneIds
}
