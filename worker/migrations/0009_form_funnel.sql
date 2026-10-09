-- Registration funnel counts (worker/src/funnel.ts). One counter per form, UTC
-- day and event: `view`, `reached:<field key>`, `submit_attempt`, `submitted`.
--
-- Counts only. There is deliberately no column for a visitor, session, IP,
-- user agent or answer, so this table cannot say who did anything.
--
-- Numbered 0009 because 0008 is claimed by two open PRs. Needs Aaron's yes
-- before it is applied to the production `cohere` database.

CREATE TABLE IF NOT EXISTS form_funnel (
  form_slug TEXT NOT NULL,
  day       TEXT NOT NULL,             -- YYYY-MM-DD, UTC
  event     TEXT NOT NULL,
  count     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (form_slug, day, event)
);
