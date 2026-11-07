# COhere calendar keeps the festival (T-399)

Staging only. Production waits for Aaron's go.

**See it:** https://cohere-signup-staging.unforced.workers.dev/calendar, on a phone or a laptop. It runs on the real events, no test data. Compare https://cohereboulder.org/calendar, which is still blank.

**Video:** `walkthrough/calendar-keeps-the-festival.mp4` (43 s, narrated). To remake it: `walkthrough/film.py`.

## Steps

1. **The blank calendar** (`walkthrough/00-before-phone.png`, production today).
   "Here's the COhere calendar today. The festival is over, so all it says is no upcoming events."

2. **The festival is back** (`walkthrough/01-calendar-phone.png`).
   "Now it remembers. COhere 2026 happened, October 15th to the 25th. All 47 gatherings are here, day by day."

3. **Pick a day** (`walkthrough/02-calendar-phone-oct17.png`). Tap 17 on the row of days.
   "Tap a day, and you see just that day."

4. **Open an event** (`walkthrough/03-event-phone.png`). Tap any title.
   "Tap an event, and it opens, with its description and its place. The RSVP button is gone, since it already happened."

5. **On a laptop** (`walkthrough/04-calendar-desktop.png`, `05-calendar-desktop-grid.png`). The week grid lands on the festival's first week, and Second week steps to the rest. Month view opens on October.
   "On a laptop, the same events fill the week grid."

6. **Home, and what comes next** (`walkthrough/07-home-phone.png`, `08-upcoming-first-phone-test-data.png`). The second picture uses test data, because nothing real is upcoming yet.
   "The home page looks back too. And when something new goes on the calendar, it comes first, with the festival below it."
