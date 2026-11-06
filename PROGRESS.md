# T-399 progress (attempt ixfrr7m7)

Done:
- Root cause verified. regenOS `xrpc/scene.rs` (not collective.rs) applies `not_ended_sql` unconditionally. The site's `/api/events?past=1` is `[]`; the PDS has 49 records (47 real + 2 TEST), the same 47 as `/calendar.ics`.

Next:
- Worker: past events from the PDS, detail fallback. Calendar and home views. E2E lane. Staging deploy. Video. PR.

Open:
- none yet
