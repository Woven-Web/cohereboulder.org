# Report: video tour of the Oct 16–17 changes, and the newsletter photo upload

Branch `feat/reminders-images`. Brief: `CLAUDE-TASK-changes-video.md`.

## Status

**Completed.**

- Nothing was pushed or deployed.
- Nothing was sent to anyone. No email, no push.
- Production was not contacted: no live site, no production D1, no scenius.social.
- Docker was not touched.
- Every recording ran on a fresh local stack with `E2E_PORT_OFFSET=2800`: local D1 and KV, the regenOS mock, a loopback push receiver and `wrangler dev`. The browser was only allowed to reach that stack and `file://`.
- Every process the scripts started was stopped. Afterwards, nothing was listening on ports 31770–31773 or 10100–10102.

## Summary

### The video

`video-tour/cohere-changes-oct16-17.mp4`:

- 3 min 17 s long, 7.9 MB.
- H.264 High, 1280×720, 30 fps, no sound.
- A title card, then nine parts. Each part has a two-line caption bar on top: the change, then the current step.
- Phone parts are iPhone-sized (390 px). Part 1 and the calendar are at laptop width (1280). The Spanish masthead is at 1024.
- Each part is also saved on its own as `video-tour/NN-name.mp4`, with a poster `NN-name.png`.
- `video-tour/README.md` lists what each part shows, and the caveats for a non-technical viewer.

### Is the newsletter photo upload Eileen-friendly? Honest judgement of the code as it was (68eb9f3)

The before-version is saved at `video-tour/raw/before/01-newsletter-photo-before-fixes.mp4`. It is gitignored.

**What was already fine:**

- The button says **Add image**, and it opens a small, clear panel.
- **Choose File** is the computer's own file picker. There is no URL to paste.
- At laptop width the preview sits beside the text, so the photo shows up right after Upload.
- The size errors were plain enough: "That file is 31.2 MB; choose one under 25 MB."

**What was confusing for someone who isn't technical:**

1. **Where the photo lands.** It goes in as a long line, `![description](http://…/media/newsletter/<hex>-1200x800.jpg)`. Nothing on screen said that this line is the photo.
2. **How to move or remove it.** This was only explained under the folded-away "Formatting help".
3. **Wording.** "Describe it (alt text, required)" is jargon. The note talked about "1200 pixels" and "3 MB after shrinking".
4. **Errors.**
   - A wrong file type got a bare "Use a JPEG, PNG or WebP image."
   - An iPhone HEIC file got the same bare message, with nothing to say what HEIC is or what to do.
   - The error stayed on screen after a good file was chosen. You can see this in the before-video.
5. **Dragging a photo in.** It wasn't supported. Worse: browsers open a file that is dropped onto a page that doesn't handle drops, and /admin has no "unsaved changes" guard, so that would replace the page and lose the draft.
   - That is how browsers behave by default. I did **not** observe it here: Playwright's simulated drop can't trigger the browser's own navigation.

### What I changed (commits `9641c47` and `cdd9285`, both in `worker/src/admin-page.ts`)

**Labels and notes:**

- "Photo from your computer (JPEG, PNG or WebP)".
- "Describe the photo in a few words (required)".
- The panel note now says:
  - the photo goes where your cursor was;
  - you can drag a photo onto the text;
  - what the description is for;
  - big photos are made smaller and location data is removed.
- The pixel and MB numbers are gone from the note and from the size error.

**Moving and removing a photo:**

- A help line appears under the toolbar once the text has a photo, and stays hidden on sent (read-only) newsletters. It says: "Each photo is one line in the text, starting with `![`. To move a photo, cut that whole line and paste it where you want it. To remove it, delete the line."
- After an upload, the message says the same in short.

**Drag and drop:**

- Dropping a photo on the text, or on the panel, opens **Add image** with that photo chosen and the description box focused.
- A drop anywhere else on /admin is ignored, so the browser can't open the file and lose the draft. File inputs keep their own drop.
- A drop during an upload is ignored.
- A drop that replaces a chosen photo clears the old description.
- Dropping several photos says only the first was taken.
- A drop with no file in it says so.

**Errors:**

- A HEIC file gets its own message, with how to save it as a JPEG.
- A non-photo file gets "That file isn't a photo email can show. Use a JPEG, PNG or WebP image."
- Choosing a new file clears the old error.
- "Describe the photo first" replaces "Describe the image first".

**Spanish:** none, and this is deliberate. The brief asked for EN and ES strings, but the /admin portal is English-only: it is one HTML page with `lang="en"` and no translation layer. Adding Spanish just for these strings would be inconsistent with the rest of the portal. The member-facing app is not affected.

Segment 1 was re-recorded on the final code (`cdd9285`).

## Artifacts

**Commits on `feat/reminders-images`:**

| commit | what |
| --- | --- |
| `9641c47` | Newsletter photo UX fixes, plus the new checks in `scripts/newsletter-image-e2e.mjs` |
| `3fcb8b9` | `scripts/changes-video.sh` (hermetic stack) and `scripts/changes-video.mjs` (recorder and ffmpeg editor), `video-tour/README.md`, posters, and `.gitignore` for `video-tour/*.mp4` and `video-tour/raw/` |
| `cdd9285` | Review fixes for drag and drop, and plain wording in every message |
| (this commit) | This report and the re-recorded segment 1 poster |

**Files** in `video-tour/`. The MP4s are not committed:

| file | length | size |
| --- | --- | --- |
| `cohere-changes-oct16-17.mp4` | 196.8 s | 8,306,930 B (7.9 MB) |
| `01-newsletter-photo.mp4` | 45.8 s | 2,027,809 B |
| `02-notifications.mp4` | 24.8 s | 717,611 B |
| `03-evening-email.mp4` | 18.4 s | 589,034 B |
| `04-harvest-menu.mp4` | 21.2 s | 651,189 B |
| `05-home-screen-invite.mp4` | 11.9 s | 287,893 B |
| `06-board-registered.mp4` | 14.0 s | 446,711 B |
| `07-calendar-laptop.mp4` | 30.1 s | 2,030,410 B |
| `08-signin-and-past-event.mp4` | 17.2 s | 946,109 B |
| `09-spanish-masthead.mp4` | 10.4 s | 584,286 B |
| `NN-name.png` × 9 | posters, 1280×720 | 158–452 KB each |

## Checks

**Code checks, on the final code:**

- `npm run typecheck`: exit 0.
- `npm test`: 67 files passed, 1 skipped. 961 tests passed, 1 skipped.
- `npm run lint`: 0 errors, 8 warnings. All 8 were already there: the `react-refresh/only-export-components` warnings in `src/components/ui/*` and `LanguageContext.tsx`.
- `npm run build`: OK.
- `E2E_PORT_OFFSET=2800 bash scripts/newsletter-image-e2e.sh`: **39 checks passed**, "newsletter-image-e2e: all checks passed". The new checks are:
  - the HEIC message;
  - the error clears when a new file is chosen;
  - the help line, and the added-photo message;
  - a drop opens the panel with the file chosen and the description focused;
  - a second drop replaces the photo and clears the old description;
  - several files say only the first was taken;
  - a drop elsewhere on the page is ignored;
  - a drop doesn't change the text.

**Proof the new checks can fail:**

| what I broke | what the lane did |
| --- | --- |
| Put back the old `admin-page.ts` | `FAIL composer` at the HEIC message (timeout) |
| Disconnected only the drop handler | `FAIL drag and drop` (the panel never opened) |
| Commented out only the clear-description call | `FAIL drag and drop: …and clears the description written for the first one` |

Each time I restored the file and rebuilt, and the lane passed again.

**Video checks:**

- `ffprobe`: h264 High, 1280×720, yuv420p, 30 fps, 196.6–196.8 s, 8.3 MB.
- `ffmpeg -v error -i … -f null -`: exit 0, with no decode errors.
- The script itself fails if the tour is over 240 s or over 40 MB.
- The final runs reported "changes-video: no problems": no page errors and no failed steps.
- I looked at a frame from every caption step of every part.

**What that frame review caught and fixed:**

- Captions lagged the picture by about 10 s, because the recording only starts at the first painted frame. Captions are now aligned to the recording's real length.
- The phone recordings first filled only a quarter of the frame.
- The 8 PM email rendered at 980 px and was shrunk; it is now laid out at phone width.
- The Home Screen invite never appeared on Today, because the invite waits for a page with no form and Today now has the harvest card. That part now starts on Home.
- On the laptop calendar, the day list was hidden under the banner.
- The Phone/Email caption was wrong: they are separate switches, not one choice.

**`/code-review` (medium) on the fix diff:** 10 findings. The six that were worth acting on are fixed in `cdd9285`:

- a drop during an upload;
- a stale description after a replacing drop;
- the help line on read-only newsletters;
- leftover jargon in two messages;
- a HEIC message that was only for Mac users;
- dropping several files, or no file.

Not changed:

- A dropped photo goes where the **cursor** was, not where it was dropped. A textarea can't report the drop point in Chrome. The note says "where your cursor was".
- The help line's `![` test is a client-side guess, separate from the server renderer. It is close enough for a hint.

## Open

- **Migrations 0015 and 0016 still need Aaron's yes before this branch merges.** This is unchanged from `REPORT-reminders-images.md`.
- **Moving a photo still means cutting and pasting a long line of text.** The help line says how, but a small photo card in the editor would be the real fix. That is bigger than "small and safe". Owner: Aaron or Eileen to decide whether it's worth doing.
- **The "Photo added" message is in the same clay colour as errors,** and at laptop width it sits below the Send buttons. I left the colour alone because the message area is shared with errors.
- **The /admin portal has no Spanish.** See Summary. Owner: Aaron, if the organizers want Spanish in /admin.
- **Not verified in a real browser:**
  - Real OS drag and drop, as opposed to a simulated drop event.
  - That Chrome would otherwise open a dropped file and lose the draft.
  - Safari: the phone parts are Chromium emulating an iPhone.
- **Not run:**
  - the full `scripts/ci-e2e.sh`;
  - a staging deploy.
- **Next action (Uni):** watch the tour, post it, or its parts, where the organizers will see it. After Aaron's yes on the migrations, push the branch to `staging` for Eileen to try the upload.
