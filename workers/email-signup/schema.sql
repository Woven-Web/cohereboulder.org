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
