# Archive — the retired 2025 stack

Nothing in this directory is deployed, maintained, or referenced by the running
application. It is kept only as a record of how COhere 2025 worked.

The Supabase project (`pnvxrczcygrkbschkvkv`) held 144 profiles and 139
registrations. In July 2026 it had become unreachable; the data was recovered,
exported, and migrated into Cloudflare D1. See `worker/schema.sql` for the
current model and `worker/seed-from-supabase.py` for the migration that ran.

The edge functions here are the origin of several things worth remembering:
the Resend transactional email setup, the eight-email campaign arc, the iCal
calendar feed, and the RLS policies that governed the old member table.
