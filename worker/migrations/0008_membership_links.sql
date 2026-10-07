-- Local identity link and reconciliation receipt, never the membership authority.
-- No expiry: joining COhere is permanent. Apply to staging only during review.
CREATE TABLE IF NOT EXISTS membership_links (
  person_id TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  did TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'member')),
  role TEXT,
  updated_at TEXT NOT NULL
);
