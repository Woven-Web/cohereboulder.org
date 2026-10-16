-- "Phone and email both" for a note. ADD-ONLY: one nullable column, nothing existing is altered.
-- Needs Aaron's yes before it is applied to production (the deploy workflow applies it on push to main).
--
-- also_email is a comma-separated list of note types ('morning,evening') that also go by email
-- when that note's channel is push. NULL = none, which is every existing row.
ALTER TABLE notify_prefs ADD COLUMN also_email TEXT;
