import { Router } from 'express'
import { db } from '../lib/db'
import { auth, zoneFilter } from '../middleware/auth'
import { emitToZone } from '../sse/emitter'

const router = Router()
router.use(auth)

// GET /alerts — paginated, filtered by zone
router.get('/', async (req, res) => {
  const zones = zoneFilter(req)
  const page = parseInt(req.query.page as string) || 1
  const limit = 50
  const offset = (page - 1) * limit

  const zoneClause = zones ? `AND a.zone_id = ANY($3::uuid[])` : ''
  const params: unknown[] = [limit, offset]
  if (zones) params.push(zones)

  const { rows } = await db.query(`
    SELECT a.*, s.name as sensor_name, s.state as sensor_state
    FROM alerts a
    JOIN sensors s ON s.id = a.sensor_id
    WHERE 1=1 ${zoneClause}
    ORDER BY a.opened_at DESC
    LIMIT $1 OFFSET $2
  `, params)

  res.json(rows)
})

// PATCH /alerts/:id/status — transition with audit
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params
  const { status, note } = req.body
  const op = req.operator!

  // Fetch current alert — also checks zone access
  const zones = zoneFilter(req)
  const zoneClause = zones ? `AND zone_id = ANY($2::uuid[])` : ''
  const params: unknown[] = [id]
  if (zones) params.push(zones)

  const { rows: [alert] } = await db.query(
    `SELECT * FROM alerts WHERE id = $1 ${zoneClause}`, params
  )
  if (!alert) return res.status(404).json({ error: 'Alert not found' })

  // Valid transitions only
  const allowed: Record<string, string[]> = {
    open: ['acknowledged', 'resolved'],
    acknowledged: ['resolved'],
    resolved: []
  }
  if (!allowed[alert.status]?.includes(status)) {
    return res.status(400).json({ error: `Cannot transition from ${alert.status} to ${status}` })
  }

  const now = new Date()
  await db.query(`
    UPDATE alerts SET status = $1,
      acknowledged_at = CASE WHEN $1 = 'acknowledged' THEN $2 ELSE acknowledged_at END
    WHERE id = $3
  `, [status, now, id])

  await db.query(`
    INSERT INTO alert_audit_log (alert_id, changed_by, from_status, to_status, note)
    VALUES ($1, $2, $3, $4, $5)
  `, [id, op.operatorId, alert.status, status, note || null])

  // If resolved, reset sensor state if no other open alerts
  if (status === 'resolved') {
    const { rows: [other] } = await db.query(`
      SELECT id FROM alerts
      WHERE sensor_id = $1 AND status = 'open' AND id != $2
      LIMIT 1
    `, [alert.sensor_id, id])

    if (!other) {
      await db.query(`UPDATE sensors SET state = 'healthy' WHERE id = $1`, [alert.sensor_id])
      emitToZone(alert.zone_id, 'sensor_state_change', { sensorId: alert.sensor_id, state: 'healthy' })
    }
  }

  res.json({ ok: true, transition: `${alert.status} → ${status}` })
})

export default router
