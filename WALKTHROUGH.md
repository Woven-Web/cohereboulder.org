# Walkthrough: Oct 19 walk fixes

The narrated video is `walk-oct19/tour.mp4`. The stills are in `walk-oct19/pairs/` as `NN-name-before.png` and `NN-name-after.png`.

## How to run it

Local only. The stack uses a fresh local database and the regenOS mock, and nothing is sent.

```bash
npm run build
bash scripts/walk-oct19-stack.sh walk-oct19/raw/state &       # Worker + mock; prints the URLs
node scripts/walk-oct19-seed.mjs walk-oct19/raw/state         # events Oct 19–22, a registrant, the 8 PM run
node scripts/walk-oct19-pairs.mjs walk-oct19/raw/state after walk-oct19/raw/pairs
```

- The 8 PM email the seed produces is written by the local `send_email` binding. Its path is in `walk-oct19/raw/state/worker.log` (`Email: …`).
- Its links point at the local stack.

## Steps

1. **The RSVP link in the 8 PM email** (pairs 01, 02).
   - *Show:* the RSVP page, then the page after the tap.
   - *Narration:* "Tap RSVP in the evening email. The page now gives the time, and after the tap it still names the event, with Details to open it."
2. **Unsubscribe and Spanish** (pairs 03, 04, 13).
   - *Show:* the unsubscribe title, the Spanish settings page, then the calendar after a reload in Spanish.
   - *Narration:* "The unsubscribe page names the note properly. A Spanish email's link opens in Spanish, and Spanish stays chosen after a reload."
3. **Times in Spanish** (pair 05).
   - *Show:* the event header.
   - *Narration:* "Six p m, M D T, the same as the calendar cards."
4. **Loading without flashes** (pairs 06, 07, 09).
   - *Show:* Home at 0.7 s and 2.5 s, Today at 0.7 s, and the Board while it loads.
   - *Narration:* "Nothing jumps on Home, members don't see the signed-out card, and the Board doesn't show zeros while it loads."
5. **Your next** (pair 08).
   - *Show:* the link under Your next.
   - *Narration:* "It says My events, and opens the calendar on your events."
6. **Organizer portal** (pairs 10, 11, 12).
   - *Show:* "Photo added" in blue, the tabs, and the phone event editor.
   - *Narration:* "Successes no longer look like errors, the empty badges are gone, and the dates fit on a phone."
