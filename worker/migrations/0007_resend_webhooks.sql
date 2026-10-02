-- Resend delivery webhooks (worker/src/resend-webhook.ts): bounces,
-- complaints and deliveries reported back for newsletter mail.
--
-- Numbered 0007 because 0006 is taken by a concurrent branch
-- (0006_event_checkins.sql). Neither touches the other's tables, so they can
-- land in either order.

-- One row per Svix message id: the replay guard. Svix re-sends the same
-- svix-id on retries, so a second delivery of an event is acknowledged and
-- ignored. No email addresses here — the person is referenced by id.
CREATE TABLE IF NOT EXISTS resend_webhook_events (
  svix_id      TEXT PRIMARY KEY,
  type         TEXT NOT NULL,     -- email.bounced | email.complained | email.delivered | …
  email_id     TEXT,              -- Resend's id for the message (newsletter_sends.resend_id)
  bounce_type  TEXT,              -- Permanent | Transient | Undetermined (bounces only)
  person_id    TEXT,              -- the people row affected, if any
  effect       TEXT,              -- what we did: tagged-undeliverable | unsubscribed | recorded | …
  received_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resend_webhook_events_received ON resend_webhook_events(received_at);

-- The latest delivery event per recipient, next to the send status it updates.
ALTER TABLE newsletter_sends ADD COLUMN last_event TEXT;
ALTER TABLE newsletter_sends ADD COLUMN last_event_at TEXT;

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_resend_id ON newsletter_sends(resend_id);
