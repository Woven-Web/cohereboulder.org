-- Images in the admin newsletter (worker/src/newsletter-images.ts).
-- ADD-ONLY: two new tables, nothing existing is altered. Needs Aaron's yes
-- before it is applied to production (the deploy workflow applies it on push to main).
--
-- Stored like harvest photos (base64 text in D1, no R2), but in chunks: D1 caps a
-- row at 2 MB and a 3 MB image is 4 MB of base64. Served publicly at
-- /media/newsletter/<id>-<width>x<height>.<ext>, since email clients fetch it.
CREATE TABLE IF NOT EXISTS newsletter_images (
  id          TEXT PRIMARY KEY,          -- 32 hex characters
  mime        TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,
  alt         TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_image_chunks (
  image_id  TEXT NOT NULL,
  seq       INTEGER NOT NULL,
  data      TEXT NOT NULL,                -- base64, at most 500,000 characters
  PRIMARY KEY (image_id, seq)
);
