-- 003_status_samples.sql — self-measured uptime/latency heartbeats powering the
-- public /api/status strip. One row per heartbeat; uptime = observed vs expected
-- sample count over the window; latency = median(latency_ms).

CREATE TABLE IF NOT EXISTS status_samples (
  id         bigserial PRIMARY KEY,
  ts         timestamptz NOT NULL DEFAULT now(),
  ok         boolean NOT NULL DEFAULT true,
  latency_ms integer
);
CREATE INDEX IF NOT EXISTS status_samples_ts_idx ON status_samples (ts);
