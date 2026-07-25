export const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  action TEXT NOT NULL,
  target_file TEXT NOT NULL,
  description TEXT,
  old_hash TEXT,
  new_hash TEXT,
  backup_path TEXT,
  user TEXT DEFAULT 'control-plane',
  status TEXT DEFAULT 'committed'
);

CREATE TABLE IF NOT EXISTS run_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  run_id TEXT UNIQUE NOT NULL,
  platform TEXT,
  model TEXT,
  outcome TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  tool_calls INTEGER,
  duration_ms INTEGER,
  details TEXT
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE NOT NULL,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  platform TEXT,
  model TEXT,
  effort TEXT,
  outcome TEXT,
  payload TEXT
);
`;
