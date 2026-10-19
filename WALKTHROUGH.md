# Walkthrough: calendar and masthead fixes (Oct 19)

The narrated video is `shots-flash/tour.mp4`. The stills are in `shots-flash/` as `NN-name-before.png` and `NN-name-after.png`.

## How to run it

Local only. The stack uses a fresh local database and the regenOS mock, and nothing is sent.

```bash
npm run build
E2E_PORT_OFFSET=3900 bash scripts/walk-oct19-stack.sh shots-flash/raw/state &   # Worker + mock; prints the URLs
node scripts/walk-oct19-seed.mjs shots-flash/raw/state                          # events Oct 19–22
node scripts/flash-calendar-check.mjs shots-flash/raw/state after shots-flash/raw/after
```

- The check signs in as the mock member Pia (`mock-peer`), RSVPs her to two events, and slows her session answer by 0.6 s, as a real round trip to regenOS does.
- It prints the layout shift, the masthead's words over time, the week titles and the URL after each step, and exits 1 if any check fails.
- To see it by hand, open `http://127.0.0.1:23610/calendar?look=ecology` with the browser clock on Oct 20.

## Steps

1. **A member loads the calendar on a laptop** (`01-masthead-member-1280-700ms`).
   - Show: before, the masthead at 0.7 s reads "About · Join COhere · Sign in". After, the same moment shows only the tabs and the language switch. Then "Register for the gathering · pia.mock.test".
   - Say: "Before, a member saw the signed-out masthead for about half a second. Now those places stay empty until the site knows who you are."
2. **A first-time visitor** (same page, signed out).
   - Show: "Join COhere" appears at once.
   - Say: "Someone who has never signed in on this device still gets the Register button straight away."
3. **First paint on a phone** (`02-calendar-phone-*`).
   - Show: before, at 0.3 s, "Loading events…", then the host card ("You don't need an account…") and the footer, all pushed down when the list lands. After, at 0.7 s, the day trail sits in place over "Loading events…", and the list then arrives whole.
   - Say: "Layout shift went from about one to under a hundredth, on a phone and on a laptop."
4. **The week beside Your next** (`04-week-grid-1280`).
   - Show: before, "Watershe / d Walk" and "Communi / ty Potluck". After, "Watershed / Walk", and a too-long word ends in "…".
   - Say: "Titles break between words now. Hovering a chip shows the full name."
5. **Week, then reload** (`05-url-week-after-reload`).
   - Show: pick Week. The address becomes `?day=2026-10-21&view=week`. Reload: the Week is still there. "Show every date" becomes `?view=day` and survives a reload too.
   - Say: "The view is in the address, so a reload or a shared link shows the same thing."
