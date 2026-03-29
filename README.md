# GridWatch — Real-Time Infrastructure Anomaly Detection Platform

## 1. Setup

### Option A — Docker (Recommended)

**Prerequisites:** Docker Desktop

```bash
docker-compose up
```

That's it. Postgres, Redis, backend, and frontend all start automatically.

Seed the database (first time only):
```bash
docker-compose exec backend npm run seed
```

- Frontend: http://localhost:3000
- Backend: http://localhost:3001

### Option B — Local

**Prerequisites:** Node.js 18+, PostgreSQL 16, Redis 7

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Create database (PgAdmin or psql)
# Create DB named: gridwatch

# 3. Run schema
# Open PgAdmin → gridwatch DB → Query Tool → paste schema.sql → F5

# 4. Seed data
cd backend && npm run seed

# 5. Start backend (port 3001)
npm run dev

# 6. Start frontend (port 5173)
cd ../frontend && npm run dev
```

**Login credentials:**
- `alice@grid.com` / `password123` — Zone Alpha operator
- `bob@grid.com` / `password123` — Zone Beta operator
- `carol@grid.com` / `supervisor123` — Supervisor (all zones)

---

## 2. Architecture

```
POST /ingest
  │
  ├─► Write batch to readings table (durable, synchronous)
  │     └─► respond 200ms — client is done here
  │
  └─► Push job to BullMQ (Redis-backed)
        │
        └─► Anomaly worker (concurrency: 5)
              ├─► Rule A: threshold breach per reading
              ├─► Rule B: rate-of-change vs last 3 readings
              └─► Creates anomaly → alert → SSE push to dashboard

Cron (every 30s)
  ├─► Silence detector: sensors with last_seen_at > 2min → Rule C anomaly
  └─► Escalation: critical+open alerts > 5min → assign supervisor

SSE /sensors/events
  └─► Zone-scoped EventSource per operator
        └─► emitToZone() called by workers after state change
```

The key architectural decision: **ingest is decoupled from detection.** The endpoint only guarantees durable storage. All processing happens in workers. This is how the 200ms SLA is achievable regardless of batch size or detection complexity.

---

## 3. Schema Decisions

**`sensors.state` is denormalized** — The dashboard loads hundreds of sensors per zone. Calculating state from joins across anomalies and alerts on every request would be slow. State is maintained by workers after each detection cycle. One column, one read, fast dashboard.

**`alert_audit_log` is append-only** — Every status transition inserts a new row. No row is ever updated or deleted. This is intentional: in real infrastructure operations, audit trails must be tamper-proof. A `DELETE` or `UPDATE` on this table would be a bug, not a feature.

**`escalation_log` has `UNIQUE(alert_id)`** — This is the exactly-once guarantee for escalation. The cron job tries to insert an escalation row. If it already exists (duplicate), Postgres throws a unique constraint violation, we catch it and move on. No lock needed, no application-level deduplication logic.

**`readings` index on `(sensor_id, timestamp DESC)`** — The history endpoint always queries a specific sensor in a time window, ordered by recency. This composite index covers both the filter and the sort in a single index scan. Without it, 30 days of readings for a sensor would require a full table scan.

**`alerts` index on `(severity, status, opened_at)` with WHERE clause** — The escalation cron only cares about `severity = 'critical' AND status = 'open'` rows. A partial index on just those rows keeps the index small and the cron fast.

**Zone isolation at the data layer** — Every query that returns sensor, reading, or alert data filters by `zone_id`. This is not a UI check — it's in the SQL. An operator cannot infer the existence of data outside their zone by trying IDs, because the query returns 404 if the zone doesn't match. Supervisors pass `null` as the zone filter, which removes the WHERE clause entirely.

---

## 4. Real-Time Design

Server-Sent Events (SSE) over a persistent HTTP connection. No polling.

When an operator loads the dashboard, the frontend opens an `EventSource` to `GET /sensors/events`. The server registers that connection in an in-memory map keyed by `zone_id`. When a worker detects a state change, it calls `emitToZone(zoneId, event, data)` which writes directly to all open SSE connections for that zone.

Why SSE over WebSockets: SSE is unidirectional (server → client), which is all the dashboard needs. It works over standard HTTP, reconnects automatically on drop, and is significantly simpler to implement and operate than a WebSocket server.

The in-memory map is local to the Node.js process. In a multi-instance deployment, this would need to move to Redis pub/sub (each instance subscribes to zone channels and writes to its local connections). That's the production gap — noted in section 7.

---

## 5. What I Finished and What I Cut

**Finished:**
- Ingest endpoint with async BullMQ processing pipeline
- Rule A (threshold) and Rule B (rate-of-change) anomaly detection
- Rule C (pattern absence) via 30-second cron
- Alert lifecycle: open → acknowledged → resolved with valid transitions only
- Append-only audit log on every transition
- Escalation: fires once per alert via DB unique constraint, cancelled if acknowledged before 5min
- Alert suppression with suppression window API
- Historical query endpoint with anomaly flags, paginated
- Zone isolation enforced at SQL layer on all endpoints
- SSE push for real-time dashboard updates
- Frontend: login, sensor grid, alert panel, sensor detail with suppression UI

**Cut / stubbed:**
- Frontend does not use a router — page state is in-memory. Refresh loses context.
- Supervisor SSE: supervisors currently don't receive zone events (need to subscribe to all zones)
- No load test — benchmarks are architecturally justified but not measured under synthetic load
- No HTTPS / production hardening

---

## 6. The Three Hardest Problems

**1. Exactly-once escalation**

The naive approach — check if escalated, then escalate — has a race condition. Two cron ticks running concurrently could both pass the check and both escalate. I solved this with a database-level `UNIQUE(alert_id)` constraint on `escalation_log`. The first insert wins. The second gets a constraint violation, which is caught and ignored. No locks, no application state, no distributed coordination needed.

**2. Keeping ingest under 200ms**

The requirement says every reading must be durably stored before the endpoint returns. That rules out acknowledging before writing. The solution: write all readings in a single bulk `INSERT ... VALUES (...)` — one round trip to the database regardless of batch size — then respond. Push the job to BullMQ after. The detection pipeline is fully async. The benchmark is achievable because the only synchronous work is one bulk insert and one queue push.

**3. Zone isolation that can't be bypassed**

Zone isolation at the UI layer is security theatre. I put it in the SQL: every query that returns data takes the operator's `zoneIds` from the JWT and adds `AND zone_id = ANY($n::uuid[])`. The middleware extracts the filter, the route applies it. An operator who manually calls the API with a sensor ID from another zone gets a 404 — not a 403, which would confirm the ID exists. The data layer doesn't leak existence.

---

## 7. Production Gap

**SSE is process-local.** Right now, `emitToZone()` writes to connections held in the memory of one Node.js process. If you run two backend instances behind a load balancer, an operator on instance A won't receive events emitted by a worker running on instance B.

The fix: move the zone → connections map to Redis pub/sub. Workers publish events to Redis channels named by zone ID. Each backend instance subscribes to all zone channels and writes incoming messages to its locally connected SSE clients. This adds one Redis round trip per event and makes the real-time layer horizontally scalable. It's a well-understood pattern and a one-day implementation — I deprioritised it because correctness of the core flows mattered more under the time constraint.