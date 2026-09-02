-- Accountless "propose an event" flow: anyone can submit an event idea from
-- /propose (no regenOS sign-in, no admin session). It lands here as a
-- `pending` row; an organizer approves or rejects it from /admin's
-- Proposals tab. Approval publishes to the COhere calendar using the same
-- service-token createEvent the Events tab already uses
-- (worker/src/regenos-service.ts) — nothing about a pending proposal touches
-- regenOS until an organizer says so.

CREATE TABLE IF NOT EXISTS event_proposals (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  description    TEXT,
  starts_at      TEXT NOT NULL,   -- RFC3339 UTC
  ends_at        TEXT,
  mode           TEXT NOT NULL DEFAULT 'inperson',
  place_name     TEXT,
  street         TEXT,
  locality       TEXT,
  region         TEXT,
  postal_code    TEXT,
  proposer_name  TEXT,
  proposer_email TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | published | rejected
  published_did  TEXT,
  published_rkey TEXT,            -- set on approval
  reviewed_by    TEXT,
  review_note    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_proposals_status ON event_proposals(status, created_at DESC);
