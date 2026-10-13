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

-- Email RSVPs ("RSVP · remind me"), worker/migrations/0004_event_rsvps.sql.
-- Not the mailing list; rows are deleted 30 days after the event starts.
CREATE TABLE IF NOT EXISTS event_rsvps (
  id               TEXT PRIMARY KEY,
  event_did        TEXT NOT NULL,
  event_rkey       TEXT NOT NULL,
  event_name       TEXT NOT NULL,   -- snapshot at RSVP time; refreshed by the cron
  event_starts_at  TEXT NOT NULL,   -- RFC3339 UTC (toISOString), so it sorts as text
  event_where      TEXT,            -- venue line snapshot
  email            TEXT NOT NULL,   -- lowercased
  name             TEXT,
  language         TEXT NOT NULL DEFAULT 'en',  -- en | es, for the emails
  cancel_token     TEXT NOT NULL UNIQUE,
  reminder_sent_at TEXT,            -- set when the day-before reminder is claimed/sent
  created_at       TEXT NOT NULL,
  UNIQUE (event_did, event_rkey, email)
);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_starts ON event_rsvps(event_starts_at);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps(event_did, event_rkey);

-- Newsletters (worker/migrations/0005_newsletters.sql, worker/src/newsletter.ts).
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
  -- 0007_resend_webhooks.sql: after 'sent', Resend's webhook moves status to
  -- delivered / bounced (permanent only) / complained and records the latest event.
  last_event    TEXT,
  last_event_at TEXT,
  UNIQUE (newsletter_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_status ON newsletter_sends(newsletter_id, status);
-- Anonymous companion data; no content seeded, no identity/email relationship.
CREATE TABLE IF NOT EXISTS companion_daily (
 date TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
 title_es TEXT, body_es TEXT, question TEXT, question_es TEXT
);
CREATE TABLE IF NOT EXISTS companion_quests (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 title_es TEXT, description_es TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS companion_subscriptions (
 device_id TEXT PRIMARY KEY, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL,
 auth TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL,
 last_success TEXT, failure_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS companion_replies (
 device_id TEXT NOT NULL, date TEXT NOT NULL, reply TEXT NOT NULL, name TEXT,
 created_at TEXT NOT NULL, PRIMARY KEY(device_id,date)
);
CREATE TABLE IF NOT EXISTS companion_completions (
 device_id TEXT NOT NULL, quest_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(device_id,quest_id)
);
CREATE TABLE IF NOT EXISTS companion_ledger (
 date TEXT NOT NULL, slot TEXT NOT NULL, recipient TEXT NOT NULL, claimed_at TEXT NOT NULL,
 payload_en TEXT, payload_es TEXT,
 PRIMARY KEY(date,slot,recipient)
);
CREATE INDEX IF NOT EXISTS companion_quest_dates ON companion_quests(start_date,end_date);
CREATE INDEX IF NOT EXISTS companion_reply_dates ON companion_replies(date,device_id);
-- Short-lived network abuse counters; bucket is SHA-256 of UTC hour + IP.
CREATE TABLE IF NOT EXISTS companion_rate_limits (
 bucket TEXT NOT NULL, action TEXT NOT NULL, window INTEGER NOT NULL, attempts INTEGER NOT NULL,
 PRIMARY KEY(bucket,action,window)
);
CREATE INDEX IF NOT EXISTS companion_rate_windows ON companion_rate_limits(window);
CREATE INDEX IF NOT EXISTS idx_newsletter_sends_resend_id ON newsletter_sends(resend_id);

-- Resend webhook replay guard (worker/migrations/0007_resend_webhooks.sql,
-- worker/src/resend-webhook.ts). One row per svix-id; no email addresses.
CREATE TABLE IF NOT EXISTS resend_webhook_events (
  svix_id      TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  email_id     TEXT,
  bounce_type  TEXT,
  person_id    TEXT,
  effect       TEXT,
  received_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_received ON resend_webhook_events(received_at);

-- Door check-in, worker/migrations/0006_event_checkins.sql. Who actually
-- arrived; never the mailing list. Rows are deleted 30 days after the event.
CREATE TABLE IF NOT EXISTS event_checkins (
  id               TEXT PRIMARY KEY,
  event_did        TEXT NOT NULL,
  event_rkey       TEXT NOT NULL,
  event_name       TEXT NOT NULL,
  event_starts_at  TEXT NOT NULL,
  email            TEXT,
  guest_did        TEXT,
  name             TEXT,
  source           TEXT NOT NULL CHECK (source IN ('rsvp_email', 'rsvp_regenos', 'registrant', 'walkin')),
  person_id        TEXT,
  checked_in_by    TEXT NOT NULL,
  checked_in_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_checkins_email
  ON event_checkins(event_did, event_rkey, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_checkins_guest
  ON event_checkins(event_did, event_rkey, guest_did) WHERE guest_did IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_checkins_event ON event_checkins(event_did, event_rkey);
CREATE INDEX IF NOT EXISTS idx_event_checkins_starts ON event_checkins(event_starts_at);

-- Registration funnel counts, worker/migrations/0009_form_funnel.sql. Counters
-- only — no visitor, IP, user agent or answer is ever stored here.
CREATE TABLE IF NOT EXISTS form_funnel (
  form_slug TEXT NOT NULL,
  day       TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  event     TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (form_slug, day, event)
);

-- Members area, worker/migrations/0011_members.sql.
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

-- When this Worker first saw each post. The approval hook holds posts FIRST SEEN
-- after approval was switched on; the author's own createdAt can be backdated.
CREATE TABLE IF NOT EXISTS board_seen (
  uri         TEXT PRIMARY KEY,
  first_seen  TEXT NOT NULL
);

-- Who sees a member's RSVPs on their profile. Keyed by the owner's regenOS DID
-- and written only from the verified session. 'members' is the default (and an
-- absent row means members). Only regenOS RSVPs are ever shown on a profile;
-- email RSVPs (event_rsvps) are not linked to any account and never appear.
CREATE TABLE IF NOT EXISTS profile_rsvp_visibility (
  did                TEXT PRIMARY KEY,
  mode               TEXT NOT NULL DEFAULT 'members' CHECK (mode IN ('members', 'nobody')),
  hidden_event_uris  TEXT NOT NULL DEFAULT '[]',   -- JSON array of event AT-URIs
  updated_at         TEXT NOT NULL
);

-- ---- 0012_notify.sql: notifications and harvests (keep in step with the migration) ----
-- Notification preferences (see worker/migrations/0012_notify.sql for the column notes).
CREATE TABLE IF NOT EXISTS notify_prefs (
  person_key        TEXT PRIMARY KEY,
  did               TEXT,
  morning_on        INTEGER CHECK (morning_on IN (0, 1)),
  harvest_on        INTEGER CHECK (harvest_on IN (0, 1)),
  evening_on        INTEGER CHECK (evening_on IN (0, 1)),
  morning_channel   TEXT CHECK (morning_channel IN ('push', 'email')),
  harvest_channel   TEXT CHECK (harvest_channel IN ('push', 'email')),
  evening_channel   TEXT CHECK (evening_channel IN ('push', 'email')),
  email             TEXT,
  email_verified_at TEXT,
  email_optin_at    TEXT,               -- the one-tap ask in the RSVP confirmation (harvest + 8 PM emails)
  locale            TEXT NOT NULL DEFAULT 'en',
  fallback_noted_at TEXT,               -- the "push stopped working" line was shown/sent; cleared when push is live again
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notify_prefs_email ON notify_prefs(email);

-- Health of each push subscription, by the companion's device id.
-- state: live | suspect | expired. A push service 404/410 expires at once.
CREATE TABLE IF NOT EXISTS notify_devices (
  device_id       TEXT PRIMARY KEY,
  person_key      TEXT,                 -- NULL = an anonymous install (morning note only)
  installed       INTEGER NOT NULL DEFAULT 0,   -- display-mode standalone, as the page reports it
  permission      TEXT NOT NULL DEFAULT 'default',
  state           TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'suspect', 'expired')),
  fail_count      INTEGER NOT NULL DEFAULT 0,
  last_seen_at    TEXT,                 -- heartbeat
  last_sent_at    TEXT,
  last_success_at TEXT,                 -- the push service accepted a send
  last_failure_at TEXT,
  last_shown_at   TEXT,                 -- the service worker's "shown" ping
  soft_failed_for TEXT,                 -- the last_sent_at already counted as unshown
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notify_devices_person ON notify_devices(person_key);

-- Dedupe and audit: one row per person, per note type, per day or event.
-- A fallback therefore never produces both a push and an email.
CREATE TABLE IF NOT EXISTS notify_ledger (
  type       TEXT NOT NULL CHECK (type IN ('morning', 'harvest', 'evening')),
  ref        TEXT NOT NULL,             -- the Boulder date, or '<event did>/<rkey>' for harvest
  person_key TEXT NOT NULL,
  channel    TEXT,                      -- push | email, once decided
  fell_back  INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'sent', 'skipped', 'failed')),
  reason     TEXT,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (type, ref, person_key)
);

-- A send in progress or finished, so idle minute ticks cost one indexed read.
CREATE TABLE IF NOT EXISTS notify_runs (
  type         TEXT NOT NULL,
  ref          TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (type, ref)
);

-- Harvests: a member's few words (and optionally one photo) about an event.
-- Kept in D1 rather than as regenOS circle posts: see REPORT-notify.md.
CREATE TABLE IF NOT EXISTS harvests (
  id            TEXT PRIMARY KEY,
  event_did     TEXT NOT NULL,
  event_rkey    TEXT NOT NULL,
  event_name    TEXT NOT NULL,
  event_ends_at TEXT,
  author_did    TEXT NOT NULL,
  body          TEXT NOT NULL,
  prompt        TEXT NOT NULL DEFAULT 'event' CHECK (prompt IN ('event', 'inquiry')),
  lang          TEXT NOT NULL DEFAULT 'en',
  has_photo     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  edited_at     TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_harvests_event_author ON harvests(event_did, event_rkey, author_did);
CREATE INDEX IF NOT EXISTS idx_harvests_author ON harvests(author_did, created_at);

-- The photo, a re-encoded JPEG as base64 text (no R2 binding needed).
CREATE TABLE IF NOT EXISTS harvest_photos (
  harvest_id TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL
);
