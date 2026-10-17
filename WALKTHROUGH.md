# Walkthrough: changing your email settings from the email

## How to run it

Local only, against the regenOS mock and a fresh local database (nothing is sent):

```bash
npm run build
ONCE_SHOTS_DIR=$PWD/shots-once bash scripts/notify-e2e.sh
```

The lane signs a settings link for a test address and opens it in a browser. It clicks the buttons and
checks the database after each one. The screenshots below come from that run, in `shots-once/`.

## Steps

1. **The 8 PM email's footer.** Show the bottom of a "Tomorrow at COhere" email: "Change your settings · Unsubscribe".
   *Narration:* "Every evening email ends with two links. 'Change your settings' now opens your settings straight away, with no sign-in."

2. **The settings page** (`shots-once/settings-from-email-390.png`). Show "Settings for <address>": Morning note (off) and Ready for tomorrow (on).
   *Narration:* "This is what a registrant sees. The 8 PM email is on, the morning email is off. Opening the page changes nothing."

3. **Turn one on or off** (`shots-once/settings-from-email-evening-off-390.png`). Press "Turn it off" on Ready for tomorrow; the line changes to "Off. You won’t get this one."
   *Narration:* "One button per email. It saves when you press it, and only then."

4. **Sign in for more.** Point at the "Sign in for more" card.
   *Narration:* "Phone notifications, event reminders and harvest invitations need an account. This takes you to sign in, then to the full settings."

5. **On a laptop** (`shots-once/settings-from-email-1280.png`).
   *Narration:* "The same page on a wide screen."

What you can't see: a registrant who changed nothing now gets one email a day from the notify system, the 8 PM note. Tests prove it across a full day. If the RSVP day-before reminder is ever switched back on, it skips anyone already getting that note by email.
