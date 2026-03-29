import { Router } from 'express'
import { z } from 'zod'
import { db } from '../lib/db'
import { readingsQueue } from '../lib/queue'

const router = Router()

const ReadingSchema = z.object({
  sensor_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  voltage: z.number().optional(),
  current: z.number().optional(),
  temperature: z.number().optional(),
  status_code: z.string().optional(),
})

const BatchSchema = z.array(ReadingSchema).max(1000)

router.post('/', async (req, res) => {
  // 1. Validate
  const parsed = BatchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const readings = parsed.data

  // 2. Bulk insert into postgres — this is the durable write
  //    We use a single multi-row INSERT for speed
  //    IMPORTANT: we return 200 after this write, not after processing
  const values: unknown[] = []
  const placeholders = readings.map((r, i) => {
    const base = i * 6
    values.push(r.sensor_id, r.timestamp, r.voltage ?? null, r.current ?? null, r.temperature ?? null, r.status_code ?? null)
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6})`
  }).join(',')

  let insertedIds: string[]
  try {
    const result = await db.query(
      `INSERT INTO readings (sensor_id, timestamp, voltage, current, temperature, status_code)
       VALUES ${placeholders} RETURNING id`,
      values
    )
    insertedIds = result.rows.map(r => r.id)
  } catch (err: any) {
    // If a sensor_id doesn't exist, postgres will throw FK violation
    // We return 422 so the sender knows to fix their data — not silently drop
    return res.status(422).json({ error: 'Insert failed', detail: err.message })
  }

  // 3. Push job to BullMQ — anomaly detection runs here, async
  //    If redis is down, job is lost but readings are safe in PG
  //    A recovery cron can reprocess unprocessed readings
  await readingsQueue.add('process-batch', {
    readingIds: insertedIds,
    sensorIds: [...new Set(readings.map(r => r.sensor_id))]
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 }
  })

  // 4. Update last_seen_at for each sensor — fast upsert
  const sensorIds = [...new Set(readings.map(r => r.sensor_id))]
  await db.query(
    `UPDATE sensors SET last_seen_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [sensorIds]
  )

  res.json({ accepted: readings.length, ids: insertedIds })
})

export default router
