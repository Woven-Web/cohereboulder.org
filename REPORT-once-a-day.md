# Report: once-a-day email, and settings from the email

**Status:** completed (parts 1–3), committed on `ops/once-a-day`. Not pushed, not deployed, nothing sent.

## Summary

1. **Once a day, proven.** A test runs the notify cron every minute of a full Boulder day (Sun Oct 18). It also runs the 15:00 UTC RSVP cron with its reminders switched on. The registrant has email RSVPs to a morning event, an evening event and a Monday event, and practices are written for both days. The test covers two cases: no settings row, and a settings row with every choice blank. In both, the morning, harvest, reminder and 8 PM runs all happen, and the registrant gets **exactly one email: the 8 PM note**. There is no push. Every other ledger row for them is "skipped / off".
2. **The RSVP day-before reminder no longer doubles the 8 PM note.** `runRsvpCron` now skips an address that will get tonight's 8 PM note by email. That note already lists tomorrow's events with "✓ RSVP’d". The skipped rows are marked done. Three exceptions (from review):
   - If regenOS was down that morning, the reminder still goes, because tonight's note reads the same regenOS.
   - Account (DID) people still get it, because their 8 PM note marks only regenOS RSVPs, not email ones.
   - If the check itself fails, the reminders go as before.

   RSVP confirmations are unchanged. **Note:** in production `RSVP_REMINDERS_PAUSED` is `"true"`, so this reminder isn't sent at all today. The change matters only if it is switched back on.
3. **No second 8 PM note to one address.** Within a run, an address already claimed under any key is not written to again. The case it guards: an earlier tick emailed `mailto:x`, then the person signed in as an account holding `x`. `mergeEmailPerson` already moves the ledger on the normal sign-in paths, so this is a second guard behind it.
4. **Settings from the email.** The footer's "Change your settings" is now a signed `/n/<token>` settings link (30 days). It opens a small page with no sign-in:
   - the 6 AM morning note and the 8 PM note, each with a status ("On." / "Off. You won’t get this one.") and one button, "Turn it on" or "Turn it off";
   - a "Sign in for more" card that goes to `/login?returnTo=/more/notifications`.

   Opening the page changes nothing; only a button POST does. The unsubscribe link is unchanged. "Turn push back on" (shown in fallback emails) still goes to `/more/notifications`, because that needs the phone.

The email wording is unchanged. Only the footer link's URL changed. Who gets tonight's note is unchanged.

## Artifacts

- Commits: `19e63c1` (part 1 + signed link), `f82e157` (settings page), `f2bcac2` (review fixes), plus this report and `WALKTHROUGH.md`.
- New page: `src/components/notify/EmailLinkSettings.tsx`, used by `src/pages/NotifyLink.tsx` for `settings` links.
- Screenshots (local build + regenOS mock, from the e2e lane): `shots-once/settings-from-email-390.png`, `shots-once/settings-from-email-1280.png` (how a registrant who changed nothing sees it: 8 PM on, morning off), `shots-once/settings-from-email-evening-off-390.png`.

## Checks

All run on the final tree (`f2bcac2` plus docs):

- `npm run typecheck`: exit 0, no errors.
- `npm test`: `Test Files 69 passed | 1 skipped (70)`, `Tests 994 passed | 1 skipped (995)`.
- `npm run lint`: `✖ 8 problems (0 errors, 8 warnings)`. The warnings are the existing ones in `src/components/ui/*` and `LanguageContext.tsx`; none are in files this change touches.
- `npm run build`: `✓ built in 2.42s`.
- `E2E_PORT_OFFSET=3400 bash scripts/ci-e2e.sh`: `All hermetic e2e scripts passed.`, exit 0. The new lane steps: "the emailed settings page is for that address", "opening the settings link changed nothing", "no phone controls from an email link", "Turn it on: the 8 PM note by email, no sign-in", "Turn it on: the morning note by email", "'Sign in for more' goes to sign-in, then settings", "the choices are still there after a reload", "no sideways scroll: emailed settings page", "Turn it off: the 8 PM note stops".
  - The run before it failed once in the notify lane: `senders: stopped: TypeError: fetch failed`, on `POST /api/admin/events`, before any cron tick. That route is not touched here. The lane passed when run alone right after, and the full suite then passed clean. I read it as a dropped local connection, but I didn't prove that.
- No processes left running (checked `ps` for wrangler, the mock and the push receiver). Docker was not touched.

Each new test was shown to fail first. I broke the code it covers, watched it go red, then restored it:
- RSVP skip removed (`remind = due`): the 4 whole-day tests fail.
- Address guard removed: "an account that verifies the address after an earlier tick…" fails (46 emails, expected 45). Its first version passed with the guard removed, so I rewrote it.
- Footer back to `/more/notifications`: the 3 settings-link tests fail.
- Snapshot exception removed: "still reminds a digest person when regenOS was down" fails.
- Account exception removed: the `eveningEmailTonight` test fails.

## Every email path, and whether it reaches a registrant who changed nothing

| Path | Trigger | Reaches a registrant who changed nothing? |
| --- | --- | --- |
| 8 PM note (`notify-send.ts`) | every-minute cron, 8 PM Boulder | **Yes, by design**: the one daily email, from 2026-10-17 |
| Morning note | cron, 6 AM | No: off by default for email-only people (tested) |
| Harvest invitation | cron, an hour after an RSVP'd event ends | No: needs the one-tap opt-in or the app (tested) |
| Event reminder (notify) | cron, an hour before an RSVP'd event starts | No: email only if they chose it (tested) |
| RSVP day-before reminder (`rsvps.ts`) | 15:00 UTC cron | Paused in prod (`RSVP_REMINDERS_PAUSED="true"`). If switched back on: no longer for 8 PM email people (tested); still for others |
| RSVP confirmation | their own RSVP (form, or the signed RSVP link in the 8 PM note) | Only as a reply to their action. Kept |
| Registration confirmation | their own form submit | Only as a reply to their action |
| Add-email verification | signed-in person types an address | Only on their action |
| Admin email-code login | `/api/auth/request` | No: `ADMIN_EMAIL_LOGIN="false"`, the route answers 404; admins table only |
| Event proposal mails (`proposals.ts`) | their own proposal; organizer approve/reject | Only to the proposer |
| Newsletter (`newsletter.ts`) | organizer: test, typed count, 15-min hold | Only if an organizer sends one to an audience that includes them. Never automatic |

There are no other mail calls in `registration.ts`, `me.ts`, `harvest.ts`, `checkins.ts`, `companion.ts`, `resend-webhook.ts` or the board. The companion and `/api/notify/test` are push only.

## New strings (for Eileen), `src/lib/translations.notify.ts` → `notify.emailLink`

| Key | en | es |
| --- | --- | --- |
| `turnOn` | Turn it on | Activarlo |
| `phoneOnly` | On your phone, not by email. | En tu teléfono, no por correo. |
| `moreTitle` | Sign in for more | Inicia sesión para más |
| `moreBody` | Phone notifications, event reminders and harvest invitations are in your settings once you sign in. | Los avisos en el teléfono, los recordatorios de eventos y las invitaciones a la cosecha están en tus ajustes cuando inicias sesión. |

Reused existing strings: Notifications, "From an email link · no sign-in", "Settings for {email}", the note names, descriptions and times, "On.", "Off. You won’t get this one.", "Turn it off", "Sign in", "That didn’t save…", and the footnote. The Spanish has had no native-speaker review, like the rest.

## Open

- **A skipped RSVP reminder relies on a 9 AM prediction.** If at 8 PM the 8 PM note fails to send (mail error), or regenOS fails only at 8 PM, that person gets neither. I accepted this trade for "only the once-a-day email". It applies only if `RSVP_REMINDERS_PAUSED` is switched off. Owner: Aaron, if reminders are ever turned back on.
- If RSVP reminders are switched back on, the RSVP confirmation would still say "We'll email you a reminder the morning before" to people who will instead get the 8 PM note. Today it says "add it to your calendar", because reminders are paused. Owner: whoever unpauses them.
- "Turn it off" on the email page turns that note off entirely, the same as its unsubscribe link. For someone who chose push and is getting email only as a fallback, it also stops the push. This is rare for registrants.
- `NotificationSettings`' guest mode (the `token` prop) is now unreachable. I left it in place to keep this change small; removing it is a follow-up.
- The settings link lasts 30 days, like the code's existing TTL. An old email's link then shows "This link isn’t valid any more" with a way to Notifications.
- Needs Aaron/Uni: review, merge, deploy. Nothing here was deployed. Once it is live, a settings link from a real 8 PM email should be opened once (read-only) to confirm the page loads.
