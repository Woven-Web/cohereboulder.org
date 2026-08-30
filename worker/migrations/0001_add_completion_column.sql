-- The production database was created before forms.completion existed.
-- worker/schema.sql declares the column for databases built from scratch;
-- this migration brings an existing database up to date. Harmless to a
-- running old Worker, which never names the column.
ALTER TABLE forms ADD COLUMN completion TEXT;
