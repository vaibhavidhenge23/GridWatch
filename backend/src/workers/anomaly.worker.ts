import { readingsQueue } from '../lib/queue'
import { db } from '../lib/db'
import { emitToZone } from '../sse/emitter'

export function startAnomalyWorker() {
  readingsQueue._register(async (job) => {
    const { readingIds } = job.data as { readingIds: string[], sensorIds: string[] }

    // Fetch all readings in this batch with their sensor's zone
    const { rows: readings } = await db.query(`
      SELECT r.*, s.zone_id
      FROM readings r
      JOIN sensors s ON s.id = r.sensor_id
      WHERE r.id = ANY($1::uuid[])
    `, [readingIds])

    for (const reading of readings) {
      // Fetch rules for this sensor
      const { rows: rules } = await db.query(
        `SELECT * FROM detection_rules WHERE sensor_id = $1`,
        [reading.sensor_id]
      )

      // Check if sensor is currently suppressed
      const { rows: [suppression] } = await db.query(`
        SELECT id FROM suppression_windows
        WHERE sensor_id = $1
          AND start_time <= NOW()
          AND end_time >= NOW()
        LIMIT 1
      `, [reading.sensor_id])

      const isSuppressed = !!suppression

      for (const rule of rules) {
        let triggered = false
        let detail: Record<string, unknown> = {}

        // --- Rule A: Threshold breach ---
        if (rule.rule_type === 'threshold' && rule.metric) {
          const value = reading[rule.metric]
          if (value !== null) {
            if ((rule.min_value !== null && value < rule.min_value) ||
                (rule.max_value !== null && value > rule.max_value)) {
              triggered = true
              detail = { metric: rule.metric, value, min: rule.min_value, max: rule.max_value }
            }
          }
        }

        // --- Rule B: Rate of change spike ---
        if (rule.rule_type === 'rate_of_change' && rule.metric) {
          const value = reading[rule.metric]
          // Get avg of previous 3 readings for this sensor
          const { rows: prev } = await db.query(`
            SELECT AVG(${rule.metric}) as avg_val
            FROM (
              SELECT ${rule.metric} FROM readings
              WHERE sensor_id = $1
                AND timestamp < $2
                AND ${rule.metric} IS NOT NULL
              ORDER BY timestamp DESC
              LIMIT 3
            ) sub
          `, [reading.sensor_id, reading.timestamp])

          const avg = parseFloat(prev[0]?.avg_val)
          if (!isNaN(avg) && avg !== 0 && value !== null) {
            const changePct = Math.abs((value - avg) / avg) * 100
            if (changePct > rule.change_pct) {
              triggered = true
              detail = { metric: rule.metric, value, avg, changePct, threshold: rule.change_pct }
            }
          }
        }

        if (!triggered) continue

        // Write anomaly
        const { rows: [anomaly] } = await db.query(`
          INSERT INTO anomalies (reading_id, sensor_id, rule_id, rule_type, detail, suppressed)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [reading.id, reading.sensor_id, rule.id, rule.rule_type, JSON.stringify(detail), isSuppressed])

        // If suppressed — record anomaly but skip alert
        if (isSuppressed) continue

        // Create alert
        const { rows: [alert] } = await db.query(`
          INSERT INTO alerts (anomaly_id, sensor_id, zone_id, severity, status, assigned_to)
          SELECT $1, $2, s.zone_id,
                 $3, 'open',
                 -- assign to first operator in this zone
                 (SELECT oz.operator_id FROM operator_zones oz
                  JOIN operators op ON op.id = oz.operator_id
                  WHERE oz.zone_id = s.zone_id AND op.role = 'operator'
                  LIMIT 1)
          FROM sensors s WHERE s.id = $2
          RETURNING id, zone_id, severity
        `, [anomaly.id, reading.sensor_id, rule.severity])

        // Audit log entry
        await db.query(`
          INSERT INTO alert_audit_log (alert_id, from_status, to_status, note)
          VALUES ($1, NULL, 'open', 'auto-detected')
        `, [alert.id])

        // Update sensor state
        const newState = rule.severity === 'critical' ? 'critical' : 'warning'
        await db.query(
          `UPDATE sensors SET state = $1 WHERE id = $2`,
          [newState, reading.sensor_id]
        )

        // Push to dashboard via SSE
        emitToZone(alert.zone_id, 'sensor_state_change', {
          sensorId: reading.sensor_id,
          state: newState,
          alertId: alert.id,
          severity: alert.severity
        })
      }

      // Mark reading as processed
      await db.query(`UPDATE readings SET processed = true WHERE id = $1`, [reading.id])
    }
  })

  readingsQueue.on('failed', (_job: any, err: any) => {
    console.error(`[worker] job failed:`, err.message)
  })

  console.log('[worker] Anomaly detection worker started')
}
