PRAGMA foreign_keys = ON;

ALTER TABLE audit_events ADD COLUMN previous_hash TEXT;
ALTER TABLE audit_events ADD COLUMN event_hash TEXT;

CREATE TABLE audit_chain_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  head_hash TEXT,
  legacy_seal_hash TEXT,
  legacy_event_count INTEGER NOT NULL DEFAULT 0 CHECK (legacy_event_count >= 0),
  enforcement_enabled INTEGER NOT NULL DEFAULT 0 CHECK (enforcement_enabled IN (0, 1)),
  sealed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO audit_chain_state (id) VALUES (1);

CREATE UNIQUE INDEX idx_audit_event_hash
  ON audit_events (event_hash)
  WHERE event_hash IS NOT NULL;

CREATE TRIGGER audit_events_require_chain
BEFORE INSERT ON audit_events
WHEN (SELECT enforcement_enabled FROM audit_chain_state WHERE id = 1) = 1
 AND (NEW.previous_hash IS NULL OR NEW.event_hash IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_CHAIN_REQUIRED');
END;

CREATE TRIGGER audit_events_match_chain_head
BEFORE INSERT ON audit_events
WHEN NEW.previous_hash IS NOT NULL AND NEW.event_hash IS NOT NULL
BEGIN
  SELECT (CASE
    WHEN (SELECT head_hash FROM audit_chain_state WHERE id = 1) IS NULL
      THEN RAISE(ABORT, 'AUDIT_CHAIN_UNSEALED')
    WHEN NEW.previous_hash != (SELECT head_hash FROM audit_chain_state WHERE id = 1)
      THEN RAISE(ABORT, 'AUDIT_CHAIN_CONFLICT')
  END);
END;

CREATE TRIGGER audit_events_advance_chain
AFTER INSERT ON audit_events
WHEN NEW.event_hash IS NOT NULL
BEGIN
  UPDATE audit_chain_state
  SET head_hash = NEW.event_hash,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;

CREATE TRIGGER audit_events_immutable_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
END;

CREATE TRIGGER audit_events_immutable_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_EVENTS_IMMUTABLE');
END;
