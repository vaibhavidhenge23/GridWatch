import { Router } from 'express'
import { db } from '../lib/db'
import { auth, zoneFilter } from '../middleware/auth'
import { addClient, removeClient } from '../sse/emitter'

const router = Router()
router.use(auth)

// GET /sensors — all sensors in operator's zone
router.get('/', async (req, res) => {
  const zones = zoneFilter(req)
  const zoneClause = zones ? `WHERE zone_id = ANY($1::uuid[])` : ''
  const params = zones ? [zones] : []

  const { rows } = await db.query(
    `SELECT s.*, z.name as zone_name FROM sensors s
     JOIN zones z ON z.id = s.zone_id
     ${zoneClause} ORDER BY s.name`,
    params
  )
  res.json(rows)
})

// GET /sensors/events — SSE stream, zone-scoped
router.get('/events', (req, res) => {
  const op = req.operator!

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send heartbeat every 15s to keep connection alive
  const hb = setInterval(() => res.write(':heartbeat\n\n'), 15000)

  // Register this client for each of their zones
  const zones = op.role === 'supervisor' ? [] : op.zoneIds
  zones.forEach(zid => addClient(zid, res))

  req.on('close', () => {
    clearInterval(hb)
    zones.forEach(zid => removeClient(zid, res))
  })
})

// GET /sensors/:id/history — paginated readings with anomaly flags
// Must return in <300ms for 30 days of data
router.get('/:id/history', async (req, res) => {
  const { id } = req.params
  const { from, to, page = '1' } = req.query as Record<string, string>
  const limit = 100
  const offset = (parseInt(page) - 1) * limit

  // Zone check — operator must own this sensor
  const zones = zoneFilter(req)
  const { rows: [sensor] } = await db.query(
    `SELECT id, zone_id FROM sensors WHERE id = $1 ${zones ? 'AND zone_id = ANY($2::uuid[])' : ''}`,
    zones ? [id, zones] : [id]
  )
  if (!sensor) return res.status(404).json({ error: 'Not found' })

  // Single query: readings + whether any anomaly existed for each reading
  // The idx_readings_sensor_time index makes this fast on 30 days of data
  const { rows } = await db.query(`
    SELECT
      r.*,
      CASE WHEN COUNT(an.id) > 0 THEN true ELSE false END as has_anomaly,
      json_agg(
        CASE WHEN an.id IS NOT NULL THEN
          json_build_object('id', an.id, 'rule_type', an.rule_type, 'detail', an.detail,
            'alert_id', al.id, 'alert_status', al.status)
        END
      ) FILTER (WHERE an.id IS NOT NULL) as anomalies
    FROM readings r
    LEFT JOIN anomalies an ON an.reading_id = r.id
    LEFT JOIN alerts al ON al.anomaly_id = an.id
    WHERE r.sensor_id = $1
      ${from ? 'AND r.timestamp >= $4' : ''}
      ${to   ? `AND r.timestamp <= $${from ? '5' : '4'}` : ''}
    GROUP BY r.id
    ORDER BY r.timestamp DESC
    LIMIT $2 OFFSET $3
  `, [id, limit, offset, ...(from ? [from] : []), ...(to ? [to] : [])])

  res.json({ data: rows, page: parseInt(page), limit })
})

export default router
