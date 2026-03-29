import 'dotenv/config'
import { db } from '../lib/db'
import bcrypt from 'bcryptjs'

async function seed() {
  console.log('Seeding...')

  // Upsert zones then fetch
  await db.query(`INSERT INTO zones (name) VALUES ('Zone Alpha'),('Zone Beta'),('Zone Gamma') ON CONFLICT (name) DO NOTHING`)
  const { rows: zones } = await db.query(`SELECT id, name FROM zones ORDER BY name`)
  const zA = zones.find((z: any) => z.name === 'Zone Alpha')
  const zB = zones.find((z: any) => z.name === 'Zone Beta')
  const zC = zones.find((z: any) => z.name === 'Zone Gamma')
  console.log('Zones:', zones.map((z: any) => z.name))

  const hash = await bcrypt.hash('password123', 10)
  const supHash = await bcrypt.hash('supervisor123', 10)
  await db.query(`
    INSERT INTO operators (name, email, password_hash, role) VALUES
      ('Alice (Operator)', 'alice@grid.com', $1, 'operator'),
      ('Bob (Operator)',   'bob@grid.com',   $1, 'operator'),
      ('Carol (Supervisor)', 'carol@grid.com', $2, 'supervisor')
    ON CONFLICT (email) DO NOTHING
  `, [hash, supHash])
  const { rows: ops } = await db.query(`SELECT id, name, role FROM operators ORDER BY name`)
  const alice = ops.find((o: any) => o.name === 'Alice (Operator)')
  const bob = ops.find((o: any) => o.name === 'Bob (Operator)')
  console.log('Operators:', ops.map((o: any) => o.name))

  if (alice) await db.query(`INSERT INTO operator_zones (operator_id, zone_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [alice.id, zA.id])
  if (bob) await db.query(`INSERT INTO operator_zones (operator_id, zone_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [bob.id, zB.id])

  // Check if sensors already exist
  const { rows: [{ count }] } = await db.query(`SELECT COUNT(*) as count FROM sensors`)
  if (parseInt(count) < 1000) {
    for (let i = 1; i <= 1000; i++) {
      const zone = i <= 400 ? zA : i <= 700 ? zB : zC
      await db.query(
        `INSERT INTO sensors (name, zone_id, state) VALUES ($1,$2,'healthy') ON CONFLICT DO NOTHING`,
        [`SENSOR-${String(i).padStart(4, '0')}`, zone.id]
      )
    }
    console.log('1000 sensors created')
  } else {
    console.log('Sensors already exist, skipping')
  }

  const { rows: sensors } = await db.query(`SELECT id FROM sensors LIMIT 200`)
  const now = Date.now()
  let rCount = 0
  for (const sensor of sensors) {
    for (let j = 0; j < 50; j++) {
      await db.query(
        `INSERT INTO readings (sensor_id, timestamp, voltage, current, temperature, status_code) VALUES ($1,$2,$3,$4,$5,$6)`,
        [sensor.id, new Date(now - j * 10000).toISOString(), 220 + Math.random() * 20, 10 + Math.random() * 5, 60 + Math.random() * 30, 'OK']
      )
      rCount++
    }
  }
  console.log(`${rCount} readings inserted`)

  const { rows: first50 } = await db.query(`SELECT id FROM sensors LIMIT 50`)
  for (const s of first50) {
    await db.query(`INSERT INTO detection_rules (sensor_id, rule_type, metric, min_value, max_value, severity) VALUES ($1,'threshold','voltage',200,250,'warning') ON CONFLICT DO NOTHING`, [s.id])
    await db.query(`INSERT INTO detection_rules (sensor_id, rule_type, metric, max_value, severity) VALUES ($1,'threshold','temperature',100,'critical') ON CONFLICT DO NOTHING`, [s.id])
  }

  console.log('Done! alice@grid.com/password123 | carol@grid.com/supervisor123')
  await db.end()
}

seed().catch(e => { console.error(e); process.exit(1) })