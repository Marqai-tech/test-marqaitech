-- Speeds up the Punch Activity Log query, which filters by employee and
-- timestamp range and sorts newest punches first.
CREATE INDEX IF NOT EXISTS "PunchEvent_employeeId_timestamp_idx"
  ON "PunchEvent" ("employeeId", "timestamp");
