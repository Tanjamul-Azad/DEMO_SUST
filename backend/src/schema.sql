-- QueueStorm SQLite schema. Append-only classification log + feature tables.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tickets (
  ticket_id   TEXT PRIMARY KEY,
  channel     TEXT,
  locale      TEXT,
  message     TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classifications (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id             TEXT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  case_type             TEXT NOT NULL,
  severity              TEXT NOT NULL,
  department            TEXT NOT NULL,
  agent_summary         TEXT NOT NULL,
  human_review_required INTEGER NOT NULL,
  confidence            REAL NOT NULL,
  method                TEXT NOT NULL,        -- 'rules' | 'gemma' | 'hybrid'
  safety_passed         INTEGER NOT NULL,
  latency_ms            INTEGER,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_class_ticket   ON classifications(ticket_id);
CREATE INDEX IF NOT EXISTS idx_class_created  ON classifications(created_at);
CREATE INDEX IF NOT EXISTS idx_class_severity ON classifications(severity);
CREATE INDEX IF NOT EXISTS idx_class_case     ON classifications(case_type);

CREATE TABLE IF NOT EXISTS reviews (
  ticket_id  TEXT PRIMARY KEY REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  risk_score REAL NOT NULL,
  indicators TEXT NOT NULL,                   -- JSON array
  reasons    TEXT,                            -- JSON array
  status     TEXT NOT NULL DEFAULT 'open',    -- open | claimed | escalated | safe
  sla_due    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS replies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id     TEXT NOT NULL REFERENCES tickets(ticket_id) ON DELETE CASCADE,
  locale        TEXT,
  draft         TEXT NOT NULL,
  policy_passed INTEGER NOT NULL,
  method        TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS insights (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  window     TEXT NOT NULL,
  narrative  TEXT NOT NULL,
  anomalies  TEXT,                            -- JSON array
  stats      TEXT,                            -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
