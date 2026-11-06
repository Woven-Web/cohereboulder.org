# T-399 progress (attempt ixfrr7m7)

Done:
- Root cause verified: regenOS `xrpc/scene.rs` applies `not_ended_sql` unconditionally.
- Worker reads ended events from the PDS. Calendar and home look back. `past-calendar-e2e` lane.
- Staging deployed once; live check passed. Review round 1 fixed.

Next:
- Review round 2, final full e2e against upstream baseline, redeploy staging, live check, film, PR.

Open:
- See the final report.
