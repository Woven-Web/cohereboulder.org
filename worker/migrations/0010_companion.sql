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
