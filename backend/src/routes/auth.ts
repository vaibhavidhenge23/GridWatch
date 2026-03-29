import { Router } from 'express'
import { db } from '../lib/db'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { auth } from '../middleware/auth'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body
  const { rows: [op] } = await db.query(
    `SELECT * FROM operators WHERE email = $1`, [email]
  )
  if (!op || !await bcrypt.compare(password, op.password_hash))
    return res.status(401).json({ error: 'Invalid credentials' })

  const { rows: zones } = await db.query(
    `SELECT zone_id FROM operator_zones WHERE operator_id = $1`, [op.id]
  )

  const token = jwt.sign({
    operatorId: op.id,
    role: op.role,
    zoneIds: zones.map((z: any) => z.zone_id)
  }, process.env.JWT_SECRET!, { expiresIn: '8h' })

  res.json({ token, name: op.name, role: op.role })
})

// Suppression
export const suppressionRouter = Router()
suppressionRouter.use(auth)

suppressionRouter.post('/', async (req, res) => {
  const { sensor_id, start_time, end_time, reason } = req.body
  const op = req.operator!

  // Zone check
  const zones = op.role === 'supervisor' ? null : op.zoneIds
  const { rows: [sensor] } = await db.query(
    `SELECT id FROM sensors WHERE id = $1 ${zones ? 'AND zone_id = ANY($2::uuid[])' : ''}`,
    zones ? [sensor_id, zones] : [sensor_id]
  )
  if (!sensor) return res.status(404).json({ error: 'Sensor not found or access denied' })

  const { rows: [sup] } = await db.query(`
    INSERT INTO suppression_windows (sensor_id, created_by, start_time, end_time, reason)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [sensor_id, op.operatorId, start_time, end_time, reason || null])

  // Decision: if there's an open alert for this sensor right now,
  // we mark it suppressed but do NOT close it — operator must resolve manually.
  // Documented in README.
  await db.query(`
    UPDATE alerts SET suppressed = true
    WHERE sensor_id = $1 AND status = 'open'
  `, [sensor_id])

  res.json(sup)
})
