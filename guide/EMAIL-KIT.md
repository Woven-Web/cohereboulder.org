# How to use the COhere app: email kit

> **SCAFFOLDING. Hand-edit before sending.** Every line below is a plain placeholder: what the person does, in
> as few words as possible, with no adjectives. Eileen rewrites it in her voice. Nothing here is final copy, and
> none of it was sent anywhere.

Captured 2026-10-17 (day 3), ecology look, from branch `feat/app-guide`.

- **Images:** `steps/NN-name.png` is an iPhone-sized screen (390×844, captured at 3×) in a plain phone frame.
  The same steps are in `steps/es/` (Spanish) and `steps/android/` (412×915, captured at 2.625×).
  `contact-sheet.png` shows all of the English iPhone steps on one page.
- **Videos (iPhone width, no sound):** `video/register-and-sign-in.mp4`, `video/rsvp.mp4`,
  `video/share-a-harvest.mp4`. Most email clients won't play video, so use `video/rsvp.gif` inline, or link the
  MP4s from a web page.
- **Where the screens came from:** Home and the empty registration form (steps 01–02) are the live site, read
  only. Everything else ran on a local copy, so nothing was registered, signed in, RSVP'd or posted on the
  real site. That copy uses the real public calendar (event names, times, places, photos), the real
  registration form and today's real practice. The **people are made up** (Pia Hansen, Lin Aoki, Rosa Delgado
  and others), and so are their harvests, Board posts and profiles. The harvest photo is a still from a COhere
  film (`src/assets/photos/`).

## The steps

| # | Image | What the person does | Gotchas / notes |
| --- | --- | --- | --- |
| 1 | `steps/01-home.png` | Go to cohereboulder.org. | Works in any phone browser; no app store. |
| 2 | `steps/02-register-form.png` | Tap Join COhere. Fill in your name and email. | Registration is free. Only name and email are required. |
| 3 | `steps/03-register-thanks.png` | Tap Create your account to RSVP to events. | The thank-you also asks for a donation (Make your donation); that is the existing form text. |
| 4 | `steps/04-signin.png` | Check your email address. Tap Email me a link. | The same box signs in people who already have an account. The link comes from noreply@cohereboulder.org. |
| 5 | `steps/05-signin-check-email.png` | Open the email. Tap the link, on the same phone. | Opening the link on a different device than the one that asked for it won't sign this phone in. |
| 6 | `steps/06-install.png` | iPhone: in Safari, tap Share, then Add to Home Screen, then Add. Android: tap the install button. | Shown once, a few seconds after you sign in on a phone. The same steps stay on Me (`steps/06b-install-me.png`). |
| 7 | `steps/07-notifications.png`, `steps/07b-notifications-more.png` | Open COhere from your Home Screen. Go to Me › Notifications. Switch on each note and pick Phone or Email. | **iPhone only sends notifications to the Home Screen app**, not to a Safari tab. |
| 7c | `steps/07c-notifications-email.png` | Without the app: notes come by email. | Registered people get the **8 PM note by email by default**. The morning note by email is opt-in. |
| 8 | `steps/08-today.png`, `steps/08b-today-practice.png` | Tap Today. Read the day's practice. Tap I did it. | Today also shows your next RSVPs and, after an event, a harvest invitation. |
| 9 | `steps/09-calendar.png` | Tap Calendar. | "Your next" lists what you RSVP'd to. Times are Boulder time. |
| 10 | `steps/10-calendar-day.png` | Tap a day on the trail. | The numbers on the trail are the 11 days, Oct 15–25. |
| 11 | `steps/11-calendar-rsvp.png` | Tap RSVP on an event. | One tap. Tap Going again to cancel. |
| 12 | `steps/12-calendar-my-events.png` | Tap My events. | Shows only what you RSVP'd to, for the picked day. |
| 13 | `steps/13-calendar-past-day.png` | Tap a past day. | Past events show Harvests instead of RSVP. |
| 14 | `steps/14-event.png` | Tap an event's name. | Details, place, host. |
| 15 | `steps/15-event-rsvp.png` | Tap RSVP. | Signed out, the same card asks for an email instead. |
| 16 | `steps/16-event-going.png` | You're going. | "Cancel my RSVP" undoes it. See open question 3 about the reminder line. |
| 17 | `steps/17-harvest-composer.png` | After an event you went to: write a few words. | Harvests open when the event ends. The harvest invitation note arrives about an hour after. |
| 18 | `steps/18-harvest-filled.png` | Add a photo if you want. Tap Share harvest. | Photo is optional. Harvests are visible to members only, with your name. |
| 19 | `steps/19-harvest-shared.png` | Your harvest shows on the event page. | Others' harvests are listed under it. |
| 20 | `steps/20-harvest-menu.png` | To change it: tap ⋯, then Edit or Delete. | `steps/20b-harvest-delete.png` is the confirmation. Deleting can't be undone. |
| 21 | `steps/21-board.png` | Tap Board. Read or Write a post. | Members only. Report on any post that doesn't feel right. |
| 22 | `steps/22-people.png` | Tap People. | Members only. Edit your own card under My profile. |
| 23 | `steps/23-me.png` | Tap Me for install steps, notifications and sign out. | |

## The three notes (for the "notifications" paragraph)

Facts from `worker/src/notify-core.ts` and the settings screen; wording is a placeholder.

- **Morning note, 6 AM Boulder time:** the day's practice, then today's events, your RSVPs first.
- **Harvest invitation, about an hour after an event you RSVP'd to ends:** a link to share a harvest.
- **Ready for tomorrow, 8 PM Boulder time:** tomorrow's events (and practice).
- **Defaults:** with the app installed and notifications allowed, all three are on, by phone. Without the app:
  registered people get the 8 PM note by email; the morning note by email is opt-in; the harvest invitation by
  email comes after a one-tap yes in the RSVP confirmation email.
- If the phone stops receiving, a note set to Phone falls back to email (never both, unless both are picked).
- **Unsubscribe:** every note email has "Change your settings" and "Unsubscribe" links at the bottom, and
  supports one-click unsubscribe in mail apps. In the app: Me › Notifications, switch a note off.
- **Event reminders:** the "Remind me" / "Reminders on" link on calendar cards turns on the app's notifications
  in general; it is not a reminder for that one event. (See open question 3.)

## Images that need a real phone photo or screen recording

Headless capture can't show the phone's own screens. These are the app's own instructions instead; replace or
add a real capture where marked:

| Step | What's missing | Suggested real capture |
| --- | --- | --- |
| 6 (iPhone) | Safari's Share sheet and the Add to Home Screen screen | iPhone screen recording: Safari on cohereboulder.org → Share → Add to Home Screen → Add, ending on the COhere icon on the Home Screen |
| 6 (Android) | Chrome's real install dialog ("Install app") | Android screenshot of Chrome's install dialog. `steps/android/06-install.png` shows the app's button, from a stand-in for Chrome's install prompt |
| 7 | The phone's own "Allow notifications?" prompt | iPhone screenshot of the iOS permission prompt after tapping Phone in the Home Screen app |
| 5 | The sign-in email itself | Screenshot of a real sign-in email in a mail app (a test address) |
| — | A real notification on the lock screen | One lock-screen screenshot of the 6 AM note |
| 1 | Safari/Chrome address bar | Optional: a real phone screenshot of cohereboulder.org loading |

Video `register-and-sign-in.mp4` stops at "Check your email": the real link click happens in a mail app.

## Open questions for the organizers (before the email goes out)

1. Step 3 sits under the existing completion text "Before you move on to other things, please make your
   donation" — the email may want to say whether the donation comes first or the account.
2. The 8 PM note goes to every registered person by email unless they turn it off. Say so in the email, with
   the unsubscribe link, so it isn't a surprise.
3. The RSVP card says "COhere will remind you the day before and an hour before, by the email or channel on your
   account." This site sends one reminder the day before only for **email** RSVPs (signed out). I could not
   verify that regenOS sends day-before / hour-before reminders for signed-in RSVPs. If it doesn't, the line
   promises something that won't arrive; don't repeat it in the email until someone checks.
