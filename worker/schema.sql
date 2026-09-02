-- COhere member database (Cloudflare D1)
--
-- Deliberately generic: `people` holds identity and contact details that persist
-- across years, `forms` holds the questions as DATA (so a form can change without
-- a deploy), and `submissions` stores each person's answers as a JSON blob keyed
-- to a form. Adding a question in 2026 means editing a row in `forms`, not a
-- migration.

CREATE TABLE IF NOT EXISTS people (
  id                TEXT PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  name              TEXT,
  phone             TEXT,
  orgs              TEXT,
  subscribed        INTEGER NOT NULL DEFAULT 1,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  source            TEXT,
  tags              TEXT,
  internal_notes    TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_people_email      ON people(email);
CREATE INDEX IF NOT EXISTS idx_people_created_at ON people(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_subscribed ON people(subscribed);

CREATE TABLE IF NOT EXISTS forms (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  event       TEXT,
  fields      TEXT NOT NULL,            -- JSON array of field definitions
  active      INTEGER NOT NULL DEFAULT 1,
  -- Optional confirmation email sent on submission; copy lives here so it can
  -- be edited from the admin portal without a deploy.
  confirm_subject TEXT,
  confirm_body    TEXT,
  -- Optional post-submit "thank you" screen as JSON: { title, title_es, body,
  -- body_es, link, link_label, link_label_es }. Same idea as the confirmation
  -- email — copy lives with the questions, editable without a deploy.
  -- (Added 2026-08-30; on an existing database run:
  --   ALTER TABLE forms ADD COLUMN completion TEXT;)
  completion      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  form_slug   TEXT NOT NULL,
  event       TEXT,
  data        TEXT NOT NULL,            -- JSON object of answers
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE(person_id, form_slug)
);

CREATE INDEX IF NOT EXISTS idx_submissions_person ON submissions(person_id);
CREATE INDEX IF NOT EXISTS idx_submissions_form   ON submissions(form_slug);
CREATE INDEX IF NOT EXISTS idx_submissions_event  ON submissions(event);

-- Who may sign in to the admin portal. Deliberately separate from `people`:
-- being in the community list and being able to read it are different things.
CREATE TABLE IF NOT EXISTS admins (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  added_by    TEXT,
  created_at  TEXT NOT NULL
);

-- Accountless event proposals (worker/migrations/0003_event_proposals.sql).
-- Anyone can submit one from /propose; an organizer approves or rejects it
-- from /admin's Proposals tab. Approval publishes to regenOS the same way
-- the Events tab does — nothing here touches the calendar until then.
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
