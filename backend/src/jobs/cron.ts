import cron from 'node-cron'
import { db } from '../lib/db'
import { emitToZone } from '../sse/emitter'

// Rule C: runs every 30s, finds sensors silent for >2 minutes
export function startSilenceDetector() {
  cron.schedule('*/30 * * * * *', async () => {
    try {
      // Find sensors that haven't reported in >2 minutes and aren't already 'silent'
      const { rows: silentSensors } = await db.query(`
        SELECT s.id, s.zone_id
        FROM sensors s
        WHERE s.last_seen_at < NOW() - INTERVAL '2 minutes'
          AND s.state != 'silent'
          AND s.last_seen_at IS NOT NULL
      `)

      for (const sensor of silentSensors) {
        // Check suppression
        const { rows: [suppression] } = await db.query(`
          SELECT id FROM suppression_windows
          WHERE sensor_id = $1 AND start_time <= NOW() AND end_time >= NOW()
          LIMIT 1
        `, [sensor.id])

        // Always create anomaly record
        const { rows: [anomaly] } = await db.query(`
          INSERT INTO anomalies (reading_id, sensor_id, rule_type, detail, suppressed)
          VALUES (
            (SELECT id FROM readings WHERE sensor_id = $1 ORDER BY timestamp DESC LIMIT 1),
            $1, 'pattern_absence',
            '{"reason": "no reading for >2 minutes"}',
            $2
          )
          RETURNING id
        `, [sensor.id, !!suppression])

        await db.query(`UPDATE sensors SET state = 'silent' WHERE id = $1`, [sensor.id])

        if (!suppression) {
          const { rows: [alert] } = await db.query(`
            INSERT INTO alerts (anomaly_id, sensor_id, zone_id, severity, status, assigned_to)
            SELECT $1, $2, s.zone_id, 'critical', 'open',
              (SELECT oz.operator_id FROM operator_zones oz
               JOIN operators op ON op.id = oz.operator_id
               WHERE oz.zone_id = s.zone_id AND op.role = 'operator' LIMIT 1)
            FROM sensors s WHERE s.id = $2
            RETURNING id, zone_id
          `, [anomaly.id, sensor.id])

          await db.query(`
            INSERT INTO alert_audit_log (alert_id, from_status, to_status, note)
            VALUES ($1, NULL, 'open', 'silence detected by cron')
          `, [alert.id])

          emitToZone(alert.zone_id, 'sensor_state_change', {
            sensorId: sensor.id,
            state: 'silent',
            alertId: alert.id
          })
        }
      }
    } catch (err: any) {
      console.error('[silence-cron] error:', err.message)
    }
  })
  console.log('[cron] Silence detector started (every 30s)')
}

// Escalation: runs every 30s, finds critical+open alerts > 5 min unacknowledged
export function startEscalationJob() {
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const { rows: alerts } = await db.query(`
        SELECT a.id, a.zone_id, a.assigned_to
        FROM alerts a
        LEFT JOIN escalation_log el ON el.alert_id = a.id
        WHERE a.severity = 'critical'
          AND a.status = 'open'
          AND a.acknowledged_at IS NULL
          AND a.opened_at < NOW() - INTERVAL '5 minutes'
          AND el.alert_id IS NULL   -- not yet escalated
      `)

      for (const alert of alerts) {
        // Find supervisor
        const { rows: [supervisor] } = await db.query(
          `SELECT id FROM operators WHERE role = 'supervisor' LIMIT 1`
        )
        if (!supervisor) continue

        // INSERT with UNIQUE(alert_id) — if duplicate, postgres throws, we catch it
        // This is the exactly-once guarantee
        try {
          await db.query(`
            INSERT INTO escalation_log (alert_id, escalated_to)
            VALUES ($1, $2)
          `, [alert.id, supervisor.id])

          await db.query(`
            UPDATE alerts SET assigned_to = $1 WHERE id = $2
          `, [supervisor.id, alert.id])

          await db.query(`
            INSERT INTO alert_audit_log (alert_id, from_status, to_status, note)
            VALUES ($1, 'open', 'open', 'escalated to supervisor')
          `, [alert.id])

          emitToZone(alert.zone_id, 'alert_escalated', { alertId: alert.id })
        } catch {
          // UNIQUE violation — already escalated, safe to ignore
        }
      }
    } catch (err: any) {
      console.error('[escalation-cron] error:', err.message)
    }
  })
  console.log('[cron] Escalation job started (every 30s)')
}
