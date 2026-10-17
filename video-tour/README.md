# Video tour: what changed in the COhere app, Oct 16–17

**Watch:** `cohere-changes-oct16-17.mp4`. It is 3 min 17 s long, 7.9 MB, H.264, 1280×720, with no sound.

Each part has a caption bar at the top. The first line names the change. The second line says what is happening on screen.

Phone parts show an iPhone-sized screen (390 px wide) in the middle of the frame. Laptop parts fill the frame.

The videos are not in git (`video-tour/*.mp4` is gitignored). The poster PNGs and this README are.

## Parts

| # | File | Length | What it shows |
| --- | --- | --- | --- |
| 1 | `01-newsletter-photo.mp4` | 46 s | Laptop, /admin → Newsletter, signed in as an organizer. **Add image** opens a panel. A PDF gets a plain error. **Choose File** opens the computer's file window: a file picker, not a web address. The photo `shared-meal.webp` is chosen and described. **Upload and insert** puts it where the cursor was, and the preview beside the text shows it. A help line says how to move or remove it. Then a photo is dragged onto the text, which opens the same panel with that photo chosen. |
| 2 | `02-notifications.mp4` | 25 s | Me → Notifications. Each note has an on/off switch and separate Phone and Email buttons. The new **Event reminders** row, one hour before an event you RSVP'd to. Everything is turned off, and Home then shows "You're not getting notifications." Tapping that line opens the settings. |
| 3 | `03-evening-email.mp4` | 18 s | The 8 PM email at phone width: tomorrow's practice; tomorrow's events in time order, each with a preview, Details and a one-tap RSVP (green "RSVP'd" when you're already going); today's harvests; and a footer with "Sent to", settings and unsubscribe. |
| 4 | `04-harvest-menu.mp4` | 21 s | Share a harvest, then use the ⋯ menu: **Edit** and Save, then **Delete**, which asks first. Confirm, and the harvest is gone. |
| 5 | `05-home-screen-invite.mp4` | 12 s | A signed-in iPhone visitor gets a one-time invite to add COhere to the Home Screen (Share → Add to Home Screen). "Not now" closes it, and the same steps stay on Me. |
| 6 | `06-board-registered.mp4` | 14 s | Someone registered for 2026 but not yet on the members list opens the Board and signs in. They get in. There is no "Register" loop. |
| 7 | `07-calendar-laptop.mp4` | 30 s | Laptop calendar. Clicking a day opens it in Day view. Oct 15 is still listed, with events marked **Ended** and a **Harvests** link that opens what people shared. **All events / My events** filters the same day. |
| 8 | `08-signin-and-past-event.mp4` | 17 s | The sign-in box in the COhere look. An upcoming event has **Share** and **Add to calendar**; an event that has ended has neither and shows harvests instead. |
| 9 | `09-spanish-masthead.mp4` | 10 s | At 1024 px wide, switching to Español: the top bar still fits on one line, on Home and on the Calendar. |

Each part also has a poster still: `NN-name.png`.

## What to know when watching

- **This is a local test copy, not the live site.** The names, posts, events and harvests are made up. Nothing was sent to anyone, and nothing touched production.
- **The computer's file window doesn't appear in a recording.** The browser opens it outside the page. The caption says so, and the chosen file name then appears next to **Choose File**.
- **Part 6 skips the sign-in email.** The test copy sends no mail, so the step where they tap the link is cut. The caption says so.
- **Part 1's drag was simulated.** A script dropped a real photo file onto the text box, which is the same event a real drag produces. The yellow-and-blue dot is the pointer, added so you can follow the clicks.
- Phone parts emulate an iPhone screen in Chrome's engine, not real Safari.

## How it was made

`scripts/changes-video.sh` starts a fresh local stack with `E2E_PORT_OFFSET=2800`: local D1 and KV, the regenOS mock, a loopback push receiver and `wrangler dev`. `scripts/changes-video.mjs` then records each part with Playwright `recordVideo` and edits them with ffmpeg: captions burned in from ASS subtitles, a short title card, then everything joined.

```bash
npm run build && E2E_PORT_OFFSET=2800 bash scripts/changes-video.sh video-tour
TOUR_ONLY=01 E2E_PORT_OFFSET=2800 bash scripts/changes-video.sh video-tour     # re-record part 1 only
TOUR_EDIT_ONLY=1 node scripts/changes-video.mjs http://127.0.0.1:1 http://127.0.0.1:1 video-tour x x   # re-edit only
```

`video-tour/raw/` (gitignored) holds the raw recordings, caption files and timelines. `raw/before/01-newsletter-photo-before-fixes.mp4` is part 1 as it was **before** the upload fixes in `9641c47`.
