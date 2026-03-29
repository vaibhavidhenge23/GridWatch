-- ============================================================
-- GridWatch Schema
-- Run: psql -U postgres -d gridwatch -f schema.sql
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ZONES & OPERATORS
-- ============================================================

CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Roles: 'operator' can only see their zone, 'supervisor' sees all
CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('operator', 'supervisor')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Many-to-many: one operator can cover multiple zones
CREATE TABLE operator_zones (
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  zone_id UUID REFERENCES zones(id) ON DELETE CASCADE,
  PRIMARY KEY (operator_id, zone_id)
);

-- ============================================================
-- SENSORS
-- ============================================================

CREATE TABLE sensors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id UUID NOT NULL REFERENCES zones(id),
  name TEXT NOT NULL,
  -- state is denormalized here for fast dashboard queries
  -- updated by worker after each batch, not by the ingest endpoint
  state TEXT NOT NULL DEFAULT 'healthy' CHECK (state IN ('healthy', 'warning', 'critical', 'silent')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dashboard loads all sensors in a zone — this index is the key one
CREATE INDEX idx_sensors_zone ON sensors(zone_id);
CREATE INDEX idx_sensors_last_seen ON sensors(last_seen_at);

-- ============================================================
-- DETECTION RULES (configurable per sensor by operators)
-- ============================================================

CREATE TABLE detection_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id UUID NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('threshold', 'rate_of_change')),
  metric TEXT CHECK (metric IN ('voltage', 'current', 'temperature')),
  -- Rule A: threshold breach
  min_value NUMERIC,
  max_value NUMERIC,
  -- Rule B: rate of change — percentage threshold
  change_pct NUMERIC,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rules_sensor ON detection_rules(sensor_id);

-- ============================================================
-- READINGS (high volume — most writes land here)
-- ============================================================

CREATE TABLE readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id UUID NOT NULL REFERENCES sensors(id),
  timestamp TIMESTAMPTZ NOT NULL,
  voltage NUMERIC,
  current NUMERIC,
  temperature NUMERIC,
  status_code TEXT,
  -- set to true by the anomaly worker after processing
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Most queries are: "give me readings for sensor X in time window Y"
CREATE INDEX idx_readings_sensor_time ON readings(sensor_id, timestamp DESC);
-- For history endpoint pagination
CREATE INDEX idx_readings_processed ON readings(sensor_id, processed);

-- ============================================================
-- ANOMALIES
-- One reading can produce multiple anomalies (one per rule)
-- ============================================================

CREATE TABLE anomalies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reading_id UUID NOT NULL REFERENCES readings(id),
  sensor_id UUID NOT NULL REFERENCES sensors(id),
  rule_id UUID REFERENCES detection_rules(id),
  rule_type TEXT NOT NULL,
  detail JSONB, -- what triggered it: {metric, value, threshold}
  -- if sensor was suppressed at detection time, this is true
  suppressed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anomalies_sensor ON anomalies(sensor_id, created_at DESC);
CREATE INDEX idx_anomalies_reading ON anomalies(reading_id);

-- ============================================================
-- ALERTS
-- One anomaly → one alert (if not suppressed)
-- ============================================================

CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  anomaly_id UUID NOT NULL REFERENCES anomalies(id),
  sensor_id UUID NOT NULL REFERENCES sensors(id),
  zone_id UUID NOT NULL REFERENCES zones(id),
  assigned_to UUID REFERENCES operators(id),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  suppressed BOOLEAN DEFAULT FALSE,
  -- track when it opened for escalation timer
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  -- set when acknowledged — used to cancel escalation
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_zone_status ON alerts(zone_id, status);
CREATE INDEX idx_alerts_sensor ON alerts(sensor_id, status);
-- Escalation worker polls this to find critical+open alerts older than 5min
CREATE INDEX idx_alerts_escalation ON alerts(severity, status, opened_at)
  WHERE severity = 'critical' AND status = 'open';

-- ============================================================
-- ALERT AUDIT LOG (append-only — never update/delete)
-- Every status transition is recorded here
-- ============================================================

CREATE TABLE alert_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES alerts(id),
  changed_by UUID REFERENCES operators(id), -- NULL if system (escalation)
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_alert ON alert_audit_log(alert_id, created_at);

-- ============================================================
-- ESCALATION LOG
-- Separate table — one row per escalation per alert (exactly once enforced)
-- ============================================================

CREATE TABLE escalation_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_id UUID NOT NULL REFERENCES alerts(id),
  escalated_to UUID NOT NULL REFERENCES operators(id),
  escalated_at TIMESTAMPTZ DEFAULT NOW(),
  -- unique constraint prevents duplicate escalations
  UNIQUE(alert_id)
);

-- ============================================================
-- SUPPRESSION WINDOWS
-- ============================================================

CREATE TABLE suppression_windows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sensor_id UUID NOT NULL REFERENCES sensors(id),
  created_by UUID NOT NULL REFERENCES operators(id),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX idx_suppression_sensor_time ON suppression_windows(sensor_id, start_time, end_time);
