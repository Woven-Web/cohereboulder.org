-- Members area: the Board's moderation hooks and, later in this file, profile
-- RSVP visibility. ADD-ONLY: new tables and indexes, nothing existing is
-- altered. Posts, replies and profiles themselves live on regenOS (member-owned
-- circle records); D1 holds only COhere-side moderation and privacy settings.

-- A member's report of a post or reply. The reporter is the regenOS DID from the
-- verified session, never a client-supplied value. One report per person per post.
CREATE TABLE IF NOT EXISTS board_reports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  post_uri        TEXT NOT NULL,
  post_author_did TEXT,
  reporter_did    TEXT NOT NULL,
  reason          TEXT NOT NULL CHECK (reason IN ('spam', 'unkind', 'private_info', 'other')),
  note            TEXT,
  excerpt         TEXT,               -- what the reporter saw, as the client sent it (<= 280 chars)
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  created_at      TEXT NOT NULL,
  resolved_at     TEXT,
  resolved_by     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_board_reports_post_reporter ON board_reports(post_uri, reporter_did);
CREATE INDEX IF NOT EXISTS idx_board_reports_status ON board_reports(status, created_at);

-- COhere-side state of a post. 'hidden' is reversible; 'removed' is permanent
-- (true deletion is the author's, via regenOS). 'pending' / 'approved' are the
-- approval hook: a held post, and a held post a steward let through.
CREATE TABLE IF NOT EXISTS board_moderation (
  uri         TEXT PRIMARY KEY,
  state       TEXT NOT NULL CHECK (state IN ('hidden', 'removed', 'pending', 'approved')),
  author_did  TEXT,
  reason      TEXT,
  note        TEXT,
  excerpt     TEXT,
  actor       TEXT,                   -- the steward's email
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_moderation_state ON board_moderation(state, updated_at);

-- Board settings. 'approval' = 'on' | 'off' (absent = off); 'approval_since' is the
-- ISO time it was last switched on — only posts created after it are held.
CREATE TABLE IF NOT EXISTS board_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT
);
