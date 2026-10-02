-- Newsletters sent from /admin's Newsletter tab (worker/src/newsletter.ts),
-- through Resend — never through the Cloudflare transport that carries
-- sign-in codes.
--
-- Lifecycle: draft → scheduled (confirmed; 15-minute hold, every admin gets a
-- cancel link) → sending (the every-minute cron works through the queue) →
-- sent. A scheduled or sending newsletter can be cancelled; a cancelled one
-- can be reopened as a draft.

CREATE TABLE IF NOT EXISTS newsletters (
  id                       TEXT PRIMARY KEY,
  subject                  TEXT NOT NULL,
  html                     TEXT NOT NULL,   -- body rendered from `text`, escaped (renderNewsletterBody)
  text                     TEXT NOT NULL,   -- the organizer's source: paragraphs + light markdown
  audience                 TEXT NOT NULL,   -- JSON: {"kind":"all"} | {"kind":"form","form":…} | {"kind":"tag","tag":…}
  status                   TEXT NOT NULL DEFAULT 'draft',  -- draft | scheduled | sending | sent | cancelled
  created_by               TEXT NOT NULL,   -- admin email
  test_sent_hash           TEXT,            -- sha256(subject, text) of the version last test-sent
  test_sent_to             TEXT,
  test_sent_at             TEXT,
  scheduled_for            TEXT,            -- confirm time + 15 min (RFC3339 UTC)
  cancel_token             TEXT UNIQUE,     -- emailed to every admin; no sign-in needed
  recipient_count_confirmed INTEGER,        -- the number the organizer typed
  confirmed_by             TEXT,            -- who pressed send
  confirmed_at             TEXT,
  cancelled_by             TEXT,            -- admin email, or 'email-link'
  cancelled_at             TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  sent_at                  TEXT
);

CREATE INDEX IF NOT EXISTS idx_newsletters_status ON newsletters(status, scheduled_for);

-- One row per (newsletter, person): the double-send guard. Rows are queued
-- when the send is confirmed, claimed by the cron (status 'sending'), then
-- marked sent / failed / skipped (unsubscribed or undeliverable by send time).
CREATE TABLE IF NOT EXISTS newsletter_sends (
  newsletter_id TEXT NOT NULL REFERENCES newsletters(id) ON DELETE CASCADE,
  person_id     TEXT NOT NULL,
  email         TEXT NOT NULL,
  resend_id     TEXT,
  status        TEXT NOT NULL DEFAULT 'queued',  -- queued | sending | sent | failed | skipped
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (newsletter_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_status ON newsletter_sends(newsletter_id, status);
