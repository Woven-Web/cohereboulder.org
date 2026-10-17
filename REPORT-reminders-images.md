# Report: event reminders, and images in the admin newsletter

Branch `feat/reminders-images`, from `upstream/main` (79ee1ba). Brief: `CLAUDE-TASK-reminders-images.md`.

## Status

**Completed.** Nothing has been deployed or pushed. No emails or pushes went to anyone, and nothing was written to prod D1 or prod regenOS. All tests ran locally against the regenOS mock and the loopback push receiver.

> ⚠️ **Two new D1 migrations need Aaron's yes before merge.** Both only add things; nothing existing is changed.
> - `worker/migrations/0015_notify_reminder.sql`: two nullable columns on `notify_prefs` (`reminder_on`, `reminder_channel`) and a new table `notify_reminder_ledger`.
> - `worker/migrations/0016_newsletter_images.sql`: two new tables, `newsletter_images` and `newsletter_image_chunks`.
>
> Pushing to `main` applies both. `deploy-worker.yml` runs `d1 migrations apply` before `Deploy`, so the new Worker never runs on the old schema. A hand-run `npm run deploy` does **not** migrate. Deploying by hand before 0015 is applied would break every notification-settings save, unsubscribe and opt-in with "no such column".

## Summary

### 1. Event reminders (Benya)

A fourth note, `reminder`, goes out about an hour before an event you RSVP'd to.

- **Who:**
  - Account RSVPs: the regenOS guest list (`getEventAttendance`).
  - Email RSVPs: D1 `event_rsvps`.
- **When:** the cron looks every five minutes. The reminder is due from 65 to 45 minutes before the start, so it normally goes 60–65 minutes before. A missed tick catches up until 45 minutes before. It never goes once the event has started.
- **Skipped:**
  - events starting before 7 AM Boulder time;
  - events outside Oct 15–25;
  - cancelled events;
  - events already under way;
  - email RSVPs made less than an hour before the start.
- **Channel:**
  - **People with the app:** on by push by default.
  - **If the phone isn't live:** nothing is sent. It does **not** fall back to email.
  - **By email:** only if the person asked. That means tapping Email on the reminders row, choosing Phone and Email both, or turning the switch on with no app installed.
  - **Not by email:** for email-only or registered people, or anyone who said yes in the RSVP confirmation email. They stay off, because they already get the daily email.
  - **A push the phone refuses:** recorded as failed. It is not retried by email.
- **Push text:**
  - Title: the event's title.
  - Body: "Starts at 3:00 PM · <place>" (Spanish: "Empieza a las 3:00 p.m. · <place>").
  - Tapping it opens `/events/<did>/<rkey>`.
  - Actions: Details and Settings.
  - TTL: capped at the time left before the start.
- **Email (opt-in only):** subject "At 3:00 PM: <name>". It has the event link and the usual signed settings and unsubscribe links, plus the one-click `List-Unsubscribe` header.
- **Dedupe:** once per person per event, claimed in a ledger before any send, the same as the other notes. **This uses `notify_reminder_ledger`, not `notify_ledger`.** `notify_ledger.type` has `CHECK (type IN ('morning','harvest','evening'))`, and SQLite can only widen that by rebuilding the table, which isn't add-only. The new table has the same columns and rules. When an email person is merged into an account, both ledgers move.
- **If regenOS can't be read:** a failed guest-list read is no longer treated as "nobody RSVP'd". The run stays open and the next tick retries, until the start.
- **Settings:** Me → Notifications has its own row, "Event reminders / Recordatorios de eventos", "1 hour before an event starts". It sits between the morning note and the harvest invitation. When push isn't live, the row says reminders go to the app and that tapping Email gets them by email.
- **Old path:** the email RSVP day-before reminder in `rsvps.ts` is unchanged and still paused by `RSVP_REMINDERS_PAUSED=true`.

### 2. Images in the admin newsletter (Eileen)

- **Composer:** /admin's newsletter composer has **Add image**. It takes a jpg, png or webp, requires alt text, and inserts the image at the cursor.
- **Browser side:** the image is shrunk to at most 1200 px wide and re-encoded, which also strips EXIF and GPS. PNG stays PNG; everything else becomes JPEG, because Outlook can't show WebP.
- **Size limit:** the 3 MB limit applies **after** shrinking. Input files up to 25 MB are accepted so that normal phone photos work. That is my reading of "≤ 3 MB"; tighten it if you meant the original file.
- **Server checks:** `POST /api/admin/newsletters/images` sits behind the same admin session gate and cross-site check as the other newsletter routes. It checks:
  - the type is jpg, png or webp, and the file's actual bytes match it;
  - the size is ≤ 3 MB, enforced while reading;
  - the width read from the file header is ≤ 1200 px;
  - alt text is present.
- **Storage:** D1, base64, the same pattern as harvest photos, but split into 500,000-character chunks because a D1 row is capped at 2 MB. **No R2 was needed.**
- **Public URL:** `https://cohereboulder.org/media/newsletter/<id>-<w>x<h>.<ext>`, with an immutable cache, `nosniff` and a sandbox CSP. A name that doesn't match a stored image gets a 404, not the app.
- **Preview and sent mail:** both use an absolute https URL, `width` (min(w, 472)), escaped `alt`, and `max-width:100%`. The plain-text part shows `[Image: alt] <url>`.
- **Behaviour change:** the renderer now writes an `<img>` **only for images uploaded here**. `![x](https://other.host/…)` renders as text, so nothing can track readers. Before, any https image rendered.

## Artifacts

Commits on `feat/reminders-images`:

| commit | what |
| --- | --- |
| `32bee51` | Event reminders: core rules, sender, store, messages, migration 0015, settings row, copy fixes, unit tests |
| `8db2ea9` | e2e for reminders (lane 13, `scripts/notify-e2e.mjs`) and the reminder screenshots |
| `68eb9f3` | Newsletter images: `worker/src/newsletter-images.ts`, renderer, admin panel, migration 0016, unit tests, `scripts/newsletter-image-e2e.{sh,mjs}` (new lane 5b in `ci-e2e.sh`), screenshots |
| `5c5c77c` | Review fixes: retry a failed guest read, cap the push TTL at the start, use `rsvpInTime`, "while signed in" copy, CLAUDE.md and cron-comment docs |

Screenshots in `shots-reminders/`:

| Screenshot | What it shows |
| --- | --- |
| `reminders-settings-app-390.png` | Live phone, defaults: Event reminders on, by push (phone) |
| `reminders-settings-app-1280.png` | The same at desktop width |
| `reminders-settings-ecology-1280.png` | The ecology look (the default on the live domain) |
| `reminders-settings-nopush-390.png` | Push gone: reminders not moved to email; the row says how to get them by email |
| `reminders-settings-email-390.png` | After tapping Email |
| `newsletter-image-panel-390.png`, `newsletter-image-panel-1280.png` | The Add image panel |
| `newsletter-image-390-write.png` | The image inserted in the body |
| `newsletter-image-390.png`, `newsletter-image-1280.png` | The preview showing the image |

## Checks

Run on the final tree:

- **`npm run typecheck`:** exit 0.
- **`npm test`:** 67 test files passed, 1 skipped. 961 tests passed, 1 skipped.
  - **New reminder tests:**
    - `notify-core.test.ts`: timing window edges, the five-minute scan always landing 60–65 minutes before, the 7 AM floor, cancelled, outside the festival, `rsvpInTime`, defaults, no email fallback, email only when asked, both, and the other notes' defaults unchanged.
    - `notify-send.test.ts` (15 tests):
      - push content, Spanish, dedupe across ticks, catch-up, and nothing after the start;
      - the 7 AM skip, switched off, no live phone, push refused (no email), and phone plus email;
      - email RSVPs: opted-in only, under-an-hour skip, and the evening/harvest opt-in not counting;
      - `NOTIFY_PAUSED`;
      - a failed guest read keeps the run open and retries, and a run still unreachable at the start closes;
      - the TTL capped at the start.
    - `notify.test.ts`: settings defaults and toggles.
    - `notifyStatus.test.ts`: the status bar.
  - **New image tests:** 22 in `newsletter-images.test.ts`.
    - Upload: signed out (401), member below builder (403), cross-site (403), wrong type (415), over 3 MB including a lying Content-Length (413), bad magic bytes, type mismatch, too wide, missing alt.
    - Serving: headers, a multi-chunk round trip.
    - Renderer: an `<img>` only for our own images, with width and escaped alt.
- **`npm run lint`:** exit 0. 0 errors; 8 warnings, all already there.
- **`npm run build`:** exit 0.
- **Worker type check (ad hoc):** the repo has none for `worker/`, so I ran `tsc --strict` with `wrangler types` output. No errors in any file this branch touches. The remaining errors were already there, in `admin-gate.ts`, `push.ts`, `companion.ts:112` and `resend-webhook.ts`.
- **notify lane alone** (`E2E_PORT_OFFSET=2200 REMINDER_SHOTS_DIR=… bash scripts/notify-e2e.sh`): "Notifications and Harvest e2e passed." 125 checks, including:
  - four rows in the day's order, with reminders on by push for the live phone;
  - a dead phone not moved to email until the person taps Email, which then stores `reminder_on=1, reminder_channel='email'`;
  - two people RSVP'd through the `/xrpc` proxy. A real cron tick through `wrangler dev` sent nothing 72 minutes before, then exactly **one** push: "Reminder Tea" / "Starts at 2:02 PM · Mock Hall" with the event link, across three ticks. The ledger shows push/sent for the phone person and email for the person who chose email. `notify_ledger` was untouched.
- **image lane alone** (`newsletter-image-e2e.sh`, run by the worker that built it): 27 checks passed, run three times. It covers upload, insert at the cursor, the preview image actually loading (naturalWidth 1200), the public URL, and the test email at the Resend mock.
- **Full `E2E_PORT_OFFSET=2200 bash scripts/ci-e2e.sh`:** exit 1, run twice (before and after the review fixes) with the same result both times. **Every lane passed except lane 17, calendar-desktop-e2e**, which this branch did not cause (open item 2). The lanes that passed:
  - home/registration, regenOS sign-in, admin events + access, proposals, RSVP, Newsletter, **newsletter-image (new lane 5b)**;
  - check-in, admin-ui, admin-gate, funnel, companion, myevents;
  - board, people, rsvp-visibility, look, ecology, register-signin, board-gate (grants and fails);
  - **Notifications and Harvest (lane 13, with the new reminder checks)**.

  Lane 17 times out at `scripts/calendar-desktop-e2e.mjs:145`. The same lane, run alone on a clean checkout of `79ee1ba` (`git worktree`, since removed), failed identically at the same line.

## Open items

1. **Migrations 0015 and 0016 need Aaron's yes.** Owner: Aaron. See the box at the top.
2. **The calendar-desktop e2e lane (17) fails on `main` as well.** It times out at `scripts/calendar-desktop-e2e.mjs:145` ("My events narrows the same day…"). I ran the same lane on an untouched checkout of 79ee1ba and it failed at the same line, so this branch didn't cause it. It is probably date-dependent: it seeds 2026-10-17, which is today. Owner: whoever owns that lane.
3. **The one-hour rule is best-effort for account RSVPs.** regenOS doesn't say when someone RSVP'd. The cut is the guest list as read at the 60–65 minute scan. After a missed scan, or in a run that spills into later ticks (only with more than 60 recipients or behind the 8 PM email cap), someone who RSVP'd 45–60 minutes before the start could still get a reminder. Email RSVPs are cut exactly.
4. **Is this Benya's setup?** The default "on" needs the app **installed** (Home Screen). It is the same rule as the other notes and the brief's "app people". Someone with push enabled in a browser tab but no install gets no reminder by default. Worth confirming Benya's phone has COhere installed and is signed in. Owner: Uni or Benya.
5. **Settings oddity:** with the app installed but push dead, the reminders switch shows on while neither Phone nor Email is pressed. The row's text explains it. Cosmetic.
6. **regenOS may send its own reminders.** An old comment in `EventRsvp.tsx` claimed it reminds account RSVPs at 24 hours and 1 hour. I couldn't verify that, and the copy no longer relies on it. If it is true, signed-in people may get two reminders, one from regenOS and one from COhere.
7. **Newsletter images:**
   - Uploaded images are never deleted; there is no cleanup route yet.
   - D1 accepting 500,000-character values is unverified on real Cloudflare. It is the same order as harvest photos.
   - Before merging, do a read-only check of prod drafts for `![…](https://other-host…)`. Those now render as text the next time they're saved or previewed.
   - The admin page is English-only, as before.
8. **Spanish** has had no native-speaker pass, like the rest of the app.

## Copy that promised reminders differently (fixed)

| key | was | now |
| --- | --- | --- |
| `calendar.rsvp.reminderNote` (signed-in RSVP) | "COhere will remind you the day before and an hour before, by the email or channel on your account." / "COhere te recordará el día anterior y una hora antes, por el correo o canal de tu cuenta." | "With the COhere app on your phone, we'll remind you an hour before. Choose how in Notifications." / "Con la app de COhere en tu teléfono, te lo recordaremos una hora antes. Elige cómo en Avisos." |
| `calendar.rsvp.emailHint` | "…a confirmation and a reminder the day before." / "…una confirmación y un recordatorio el día anterior." | "No account needed: we'll email you a confirmation with a calendar file." / "No necesitas cuenta: te enviaremos una confirmación con un archivo de calendario." |
| `calendar.rsvp.emailIntro` | "…we'll send a reminder the morning before (around 9am Boulder time)…" / "…un recordatorio la mañana anterior (alrededor de las 9am…)…" | "Leave your email and we'll send a confirmation with a calendar file. It doesn't add you to our mailing list." / "Déjanos tu correo y te enviaremos una confirmación con un archivo de calendario. No te añade a nuestra lista de correo." |
| `calendar.rsvp.doneBody` | "…We'll remind you the morning before." / "…Te recordaremos la mañana anterior." | "Check your inbox for a confirmation with a calendar file." / "Revisa tu correo: te enviamos una confirmación con un archivo de calendario." |
| `calendar.rsvp.alreadyBody` | "…We'll remind you the morning before." / "…Te recordaremos la mañana anterior." | "This address had already RSVP'd — you're all set." / "Esta dirección ya había confirmado — todo listo." |
| RSVP confirmation email `remindNote` (`worker/src/rsvps.ts`) | always "We'll email you a reminder the morning before (around 9am Boulder time)." | that line only while `RSVP_REMINDERS_PAUSED` is not `"true"`; otherwise `calNote`: "Add it to your calendar and your calendar will remind you." / "Añádelo a tu calendario y tu calendario te lo recordará." |
| `almanac.remindersOnToast` | morning, harvest, 8 PM | "Notifications are on: a morning note at 6 AM, a reminder an hour before events you RSVP to while signed in, a harvest invitation after them, and an 8 PM note about tomorrow." / "Los avisos están activos: una nota a las 6 de la mañana, un recordatorio una hora antes de los eventos que confirmes con tu sesión iniciada, una invitación a la cosecha después, y un aviso a las 8 PM sobre mañana." |
| `almanac.remindersOnlyBody` | "…three times a day at most…" / "…hasta tres veces al día…" | "COhere can nudge you right on your phone: each morning, an hour before events you RSVP to while signed in, and at 8 PM." / "COhere puede avisarte directo en tu teléfono: cada mañana, una hora antes de los eventos que confirmes con tu sesión iniciada y a las 8 PM." |
| `almanac.setBody` | "…which of the three you get." / "…cuáles de los tres recibes." | "…which ones you get." / "…cuáles recibes." |
| `almanac.iosFine` | morning, harvest, 8 PM | adds "a reminder an hour before events you RSVP to (signed in)" / "un recordatorio una hora antes de los eventos que confirmes (con sesión iniciada)" |
| `notify.lede` | "Three notes…" / "Tres avisos…" | "Four notes, each on or off. Push if the app is on your phone, email if not. Event reminders go to your phone, and by email only if you ask." / "Cuatro avisos, cada uno activado o no. Push si la app está en tu teléfono, correo si no. Los recordatorios de eventos van a tu teléfono, y por correo solo si lo pides." |

Code comments corrected too: `EventRsvp.tsx` header, `src/lib/api.ts`, `NotificationSettings.tsx`, `notify-*.ts`, `wrangler.jsonc`, and the CLAUDE.md "Notifications and Harvest" section.

## New strings (EN / ES)

| key | EN | ES |
| --- | --- | --- |
| `notify.notes.reminder.name` | Event reminders | Recordatorios de eventos |
| `notify.notes.reminder.about` | The event, its start time and place. Only for events you RSVP’d to. | El evento, su hora de inicio y lugar. Solo para eventos a los que confirmaste. |
| `notify.notes.reminder.when` | 1 hour before an event starts | 1 hora antes de que empiece un evento |
| `notify.why.reminderNeedsApp` | Reminders go to the app on your phone. Tap Email to get them by email instead. | Los recordatorios van a la app de tu teléfono. Toca Correo para recibirlos por correo. |
| `notify.why.reminderGuest` | Reminders go to the app on your phone. Tap Email to get them here instead. | Los recordatorios van a la app de tu teléfono. Toca Correo para recibirlos aquí. |
| eco look: `notify.notes.reminder.when` | 1 hour before | 1 hora antes |
| eco look: `notify.why.reminder*` | Needs the app, or tap Email. | Necesita la app, o toca Correo. |
| eco look: `notify.notes.reminder.about` | (cut, like the other notes) | |
| `almanac.atHour` / `almanac.timeHour` | 1 hr before / Reminder of events you RSVP to (signed in) | 1 h antes / Recordatorio de los eventos que confirmes (con sesión iniciada) |
| push body | Starts at {time} · {place} | Empieza a las {time} · {place} |
| email subject / lead | At {time}: {name} / In about an hour: | A las {time}: {name} / En una hora, más o menos: |
| email footer note name | Event reminders | Recordatorios de eventos |
| RSVP confirmation `calNote` | Add it to your calendar and your calendar will remind you. | Añádelo a tu calendario y tu calendario te lo recordará. |

The admin newsletter strings ("Add image", alt-text label and errors) are English only, like the rest of /admin.
