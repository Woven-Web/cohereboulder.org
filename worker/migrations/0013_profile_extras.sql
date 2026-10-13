-- Profile extras: three optional short lines a member adds to their COhere
-- profile ("Bringing", "Offering", "Curious about"). ADD-ONLY. They live here,
-- not on the regenOS circle profile, so the People filter can search them
-- server-side and only members can read them. Keyed by the owner's regenOS DID
-- and written only from the verified session.
CREATE TABLE IF NOT EXISTS profile_extras (
  did         TEXT PRIMARY KEY,
  bringing    TEXT,
  offering    TEXT,
  curious     TEXT,
  updated_at  TEXT NOT NULL
);
