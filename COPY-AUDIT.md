# COPY-AUDIT: the ecology look's copy pass

Branch `feat/look-ecology`. Scope: everything visible under `?look=ecology`, en and es, plus the three notification
messages. The classic look is untouched: the pass lives in `src/lib/translations.eco.ts`, which `getTranslation`
consults only when the ecology look is on (`isEcoLook()` in `src/lib/look.ts`). `translations.ts` itself is unchanged.
A value of `["", ""]` ("CUT" in that file) hides the string, and `.alm.eco :empty` collapses the block it sat in.

## A. Cut

**Counts.** 298 strings changed under the ecology look (en and es each):
- **78** cut outright (shown as nothing).
- **220** replaced by a plain label or bare fact: "No posts yet.", "Saved.", "Didn't save. Try again."
- **3** more are gone with the sample practice. `SAMPLE_DAY_ONE` ("Welcome. Start by arriving." plus its body and
  question) no longer renders under ecology, and before Oct 15 Today shows the countdown, the trail and "Remind me".
- **17** in `worker/src/notify-messages.ts` (push and email, both languages), shortened or cut.

The 20 most visible removed lines (before text):

1. Today, Notifications: "Three notes, each on or off. Push if the app is on your phone, email if not."
2. Home, before the gathering: "Ten days, one trail" and "Each day has a small practice and a question, and a calendar the community fills. Tap a day to see what's on."
3. Home heading: "Today at COhere" (now "Today")
4. Board, People and Profile, signed out: "This part of COhere is for members." and "Sign in with your COhere account to read and write here. Nothing on it is public."
5. Same gate: "Posts and profiles are visible only to current members." and "Nothing here is searchable or public."
6. Home and Today, signed out: "Register to keep the events you choose here, or sign in if you already have."
7. Me: "Three notes: a morning note at 6 AM with the day's practice, its question and today's events; an invitation to share your harvest about an hour after an event you RSVP'd to ends; and at 8 PM, tomorrow's events. Boulder time."
8. Today, before Oct 15: "Welcome. Start by arriving." and the sample practice body ("Tonight the gathering opens. Before you go, step outside for five minutes…")
9. Event page, Harvest: "A few words, and a photo if you like, about what you took from this one."
10. Event page, Harvest: "Harvests open when the event ends. An hour after it ends we'll ask if you went."
11. Event page: "Title, time, place and description come from the COhere community calendar. Times are Boulder time."
12. Event page: "The host hasn't posted a street address yet."
13. People: "Who's here. Only current members can see this list."
14. Profile: "What other members see when they find you in People."
15. People: "COhere profile is what a person wrote for this circle. Public means they haven't made one, so you see their public scenius.social profile."
16. Profile: "Your profile can list the events you're going to. Only COhere members can see the list, and you can turn off any event."
17. Notifications: "Nothing can reach you yet." and "Install the app on your phone to get push instead."
18. Notifications: "Type your address below." and "We send a link to that address. Tap it once to confirm it's yours."
19. Notifications: "Today's practice with its question, then today's events, your RSVPs first." (and the two lines under the other notes)
20. Notifications, signed out: "Your choices follow you, not the phone. Without signing in, this phone still gets the morning note once it has notifications on."

Also gone: the Board's empty state ("Be the first. A ride, a question, a thank-you, a spare bag of squash. Small is
fine."), the install sheet's "Add COhere to your home screen. One practice a day, right where you'll see it.", the
compose note ("…There's no editing: delete and repost. No photos yet."), and the notification emails' "You get this
because the "Morning note" is on for…".

## B. Kept from existing COhere text

Every string below renders under `?look=ecology` and is quoted exactly from
`/home/uni/.hermes/cache/scratch/copy-src/live-translations.ts` (the Spanish is the live `es` value; nothing was
re-worded). The registration form is not touched: it is the live `register-2026` row, rendered by `DynamicForm`, and
its lede and thank-you are the live strings.

- "About" — live-translations.ts `nav.about`
- "Join COhere" — live-translations.ts `hero.registerHere`
- "Sign in" — live-translations.ts `registration.signIn`
- "Today" — live-translations.ts `app.today`
- "Calendar" — live-translations.ts `nav.calendar`
- "Board" — live-translations.ts `app.board`
- "See the full calendar" — live-translations.ts `home.upcomingEvents.seeFullCalendar`
- "What is COhere?" — live-translations.ts `whatIs.title`
- "COhere Boulder stokes Boulder's culture and engagement by connecting residents, organizations, artists, lea…" — live-translations.ts `whatIs.p1`
- "Connecting local community to create a regenerative, resilient future." — live-translations.ts `footer.tagline`
- "The Community Calendar" — live-translations.ts `communityCalendar.title`
- "Co-created by everyone who shows up" — live-translations.ts `communityCalendar.subtitle`
- "Browse what's unfolding, and if you're holding something you'd like to share, there's room for it here." — live-translations.ts `communityCalendar.p2`
- "Explore the Calendar" — live-translations.ts `communityCalendar.explore`
- "Co-create" — live-translations.ts `nav.participate`
- "Choose Your Own Adventure" — live-translations.ts `chooseAdventure.title`
- "There is no single way to do COhere. Ten days, a calendar the community builds together, and an open invita…" — live-translations.ts `chooseAdventure.p1`
- "Participate" — live-translations.ts `chooseAdventure.participate.title`
- "We hope all participants build new relationships, learn meaningful things about Boulder, and find their rol…" — live-translations.ts `chooseAdventure.participate.description`
- "Contribute" — live-translations.ts `chooseAdventure.contribute.title`
- "Share a story, host an event, volunteer, make art." — live-translations.ts `chooseAdventure.contribute.description`
- "Get involved in the organizing team, or anchor an element of COhere that brings a dimension of community to…" — live-translations.ts `chooseAdventure.lead.description`
- "Experience COhere" — live-translations.ts `recap2024.title`
- "See and feel what COhere is all about — films from our first two years" — live-translations.ts `videos.description`
- "COhere Boulder" — live-translations.ts `videos.filmTitle`
- "COhere 2024 Recap" — live-translations.ts `videos.recap2024Title`
- "Two years of weaving: hundreds of community members and dozens of co-created events across Boulder, strengt…" — live-translations.ts `videos.summary`
- "The Spirit of COhere" — live-translations.ts `spirit.title`
- "Active Participation" — live-translations.ts `about.livingValues.activeParticipation.title`
- "Life becomes more meaningful when we lean in, being courageously participatory" — live-translations.ts `spirit.participation.description`
- "Radical Interdependence" — live-translations.ts `about.livingValues.radicalInterdependence.title`
- "Be bold with offers and requests—discover what's possible when we lean on each other" — live-translations.ts `spirit.interdependence.description`
- "Anchor Abundance" — live-translations.ts `about.livingValues.anchorAbundance.title`
- "Give generously and trust that collectively, we are resourced for all to thrive" — live-translations.ts `spirit.abundance.description`
- ""The journey of weaving our resilience never begins and never ends. COhere is simply a rhythm that calls de…" — live-translations.ts `spirit.quote`
- "Boulder's Regenerative Ecosystem" — live-translations.ts `ecosystem.title`
- "Together with Climatique, we created this map to demonstrate the rich tapestry of projects and groups worki…" — live-translations.ts `ecosystem.description`
- "Explore the Map" — live-translations.ts `ecosystem.exploreMap`
- "Suggest Additions" — live-translations.ts `ecosystem.suggestAdditions`
- "Join the Weaving" — live-translations.ts `join.title`
- "COhere is for everyone who cares about Boulder's future and wants to be part of creating a more connected, …" — live-translations.ts `join.p1`
- "Whether you participate in events, offer your gifts, or simply embody the spirit of COhere in daily life, y…" — live-translations.ts `join.p2`
- "Stay in the loop" — live-translations.ts `signup.title`
- "Keep me posted" — live-translations.ts `signup.button`
- "A Woven Web Initiative" — live-translations.ts `footer.wovenWeb`
- "Propose an event" — live-translations.ts `joinInvite.proposeButton`
- "Subscribe to calendar" — live-translations.ts `calendar.events.subscribe`
- "What is COhere?" body, two paragraphs — **Eileen, 10-13, verbatim** (`translations.eco.ts` `whatIs.p1`, `whatIs.p2`, ecology look only; the shared classic text is untouched): "COhere is a 10-day event series designed to bring us into deeper connection to place." / "Through storytelling, relationship building, and exploring new aspects of Boulder, we invite participants to find new perspectives and passions. COhere invites curiosity and a sense of re/discovery of how we move through the world."
- "Explore events on the community events" — **Eileen, 10-13, verbatim**, the What's Coming Up subtitle (`home.upcomingEvents.subtitle` en in `translations.ts`, so it applies to every look)
- "Hosting something during COhere? You don't need an account to put it on this calendar." — live-translations.ts `calendar.proposeCallout.text`
- "Share event" — live-translations.ts `calendar.events.share`
- "Add to calendar" — live-translations.ts `calendar.events.addToCalendar`
- "Members only" — live-translations.ts `app.membersOnly`
- "Choose your handle" — live-translations.ts `login.chooseHandleTitle`
- "Your handle is your public account name. Use lowercase letters, numbers and hyphens." — live-translations.ts `app.handleHint`
- "Handle" — live-translations.ts `login.handleLabel`
- "Create my account" — live-translations.ts `login.finishButton`
- "Hosting a dinner, a walk, a workshop, a song circle? Tell us about it — no account needed. An organizer rev…" — live-translations.ts `proposeEvent.subtitle`
- "Event name" — live-translations.ts `proposeEvent.nameLabel`
- "Description" — live-translations.ts `proposeEvent.descriptionLabel`
- "What it is, who it's for, and any link people should have." — live-translations.ts `proposeEvent.descriptionHelp`
- "Starts" — live-translations.ts `proposeEvent.startsLabel`
- "How people attend" — live-translations.ts `proposeEvent.modeLabel`
- "In person" — live-translations.ts `calendar.events.mode.inperson`
- "Virtual" — live-translations.ts `calendar.events.mode.virtual`
- "Hybrid" — live-translations.ts `calendar.events.mode.hybrid`
- "Place name" — live-translations.ts `proposeEvent.placeLabel`
- "Street address" — live-translations.ts `proposeEvent.streetLabel`
- "State" — live-translations.ts `proposeEvent.regionLabel`
- "ZIP code" — live-translations.ts `proposeEvent.postalLabel`
- "If it's approved, the address is published with the event — only share one you'd put on a poster." — live-translations.ts `proposeEvent.addressNote`
- "Your name" — live-translations.ts `proposeEvent.proposerNameLabel`
- "Your email" — live-translations.ts `proposeEvent.proposerEmailLabel`
- "Optional, but the only way we can tell you whether it was approved." — live-translations.ts `proposeEvent.proposerEmailHelp`
- "Submit for review" — live-translations.ts `proposeEvent.submitButton`
- "Hosting something during COhere? Propose it for the calendar." — live-translations.ts `calendar.proposeCallout.signedInText`

- Registration page lede, thank-you and "Already joined? Sign in": unchanged from main (`Registration.tsx`).
- "We Are Our Ecology", "Weaving Our Resilience", "COhere Boulder", "Oct 15–25", "Boulder": theme words
  (`hero.theme`, `hero.tagline`, `hero.mainEvent`, `hero.dates`).
- Live Spanish used where the new look had invented its own: Tablón (`app.board`), Calendario (`nav.calendar`),
  "Solo para miembros" (`app.membersOnly`), "El tablón de COhere abre pronto" (`app.boardTitle`).
- About, Co-create, Archive, Archive 2024, Join 2025, Press kit, Telegram and 404 render their existing text: those
  pages' copy is unchanged from `main` (the branch only wrapped them in the new shell). I did not edit them.
- Not copy: the practice, question and event names in screenshots come from the local test fixture
  (`scripts/fixtures/look-companion.sql`), not from the product. Real ones are loaded into D1 by the team.
- **`live-festival.ts` was empty** (0 bytes), so no practice or question line could be checked against it; none is
  used as source copy.

## C. New, needs Eileen's OK

Everything longer than a short label that is not verbatim from a source. Short labels (1–4 words, e.g. "Saved.",
"No posts yet.", "Write a post", "Not a member yet", "Hidden by a steward.") are not listed.

| # | Screen | English | Español |
|---|---|---|---|
| 1 | Me › Notifications, delivery | App installed · notifications on | App instalada · notificaciones activas |
| 2 | Me › Notifications, delivery | Push failed. Using email. | Falló el push. Usando correo. |
| 3 | Notification email link page | Email link · no sign-in | Enlace de correo · sin iniciar sesión |
| 4 | Email link page (opt-in) | Send evening and harvest notes to {email}? | ¿Enviar los avisos de la noche y la cosecha a {email}? |
| 5 | Me (install) | Install from your browser menu. | Instala desde el menú del navegador. |
| 6 | Me (install) | No account needed. This device gets a random ID. | No hace falta cuenta. Este dispositivo recibe un ID aleatorio. |
| 7 | Install sheet, iOS | Choose Add to Home Screen. | Elige Añadir a pantalla de inicio. |
| 8 | Profile editor (consent) | Your COhere profile will be deleted. | Tu perfil de COhere se eliminará. |
| 9 | Profile › Who sees my RSVPs | RSVPs made on scenius.social are public there. | Las RSVP hechas en scenius.social son públicas allí. |
| 10 | Profile › Who sees my RSVPs | Email RSVPs are never shown. | Las RSVP por correo nunca se muestran. |
| 11 | Notification push and email footer | `<note name> · <address>` · Notification settings · Unsubscribe | `<nombre> · <correo>` · Ajustes de notificaciones · Darte de baja |
| 12 | 8 PM push body | `<n> events · <date> · going to <m>` | `<n> eventos · <fecha> · voy a <m>` |
| 13 | Emails sent as a fallback | Push failed. Sent by email. | Falló el push. Enviado por correo. |
| 14 | Confirm-your-email message | Confirm this address. / If you didn't ask for this, ignore it. | Confirma esta dirección. / Si no lo pediste, ignóralo. |
| 15 | Harvest email and push | How was it? · Share your harvest · Harvests show your name. | ¿Cómo estuvo? · Comparte tu cosecha · Las cosechas muestran tu nombre. |
| 16 | Harvest, event page | Visible to members. / Your name is shown. | Visible para miembros. / Tu nombre se muestra. |
| 17 | Board, People, Harvest | Visible to members. | Visible para miembros. |
| 18 | Evening-note opt-in (RSVP email) | Evening and harvest notes? / Yes, send them | ¿Avisos de la noche y la cosecha? / Sí, enviar |
| 19 | Home › What is COhere? (ecology look) | es translation of Eileen's What is COhere text. Until then es shows the live `whatIs.p1` and `hero.description` Spanish, which say something different | (none yet) |
| 20 | Home › What's Coming Up (all looks) | es for Eileen's What's Coming Up line. es is unchanged: "Algunos encuentros del calendario comunitario — co-creados, no programados." | (unchanged) |
| 21 | Home photos (alt text, ecology look) | Short literal alt text for Eileen's four photos, e.g. "People talking around a wooden table" | e.g. "Personas conversando alrededor de una mesa de madera" |

Spanish for every changed string is mine (the live `es` is used wherever the source has the line); like the rest of
the new Spanish in the app, it has not had a native-speaker pass.

Decision for Eileen: the Home body (What is COhere?, Choose Your Own Adventure, The Spirit of COhere, the map and
Join the Weaving) is all existing live text. I left it, since cutting it is a design call rather than a copy-pass one.

### Added after review (Uni, 10-13)
| # | Screen | English | Español |
|---|---|---|---|
| 22 | Email-link opt-in page | You can turn them off from any email. | Puedes desactivarlos desde cualquier correo. |
| 23 | Harvest photo | Photos are visible to members. | Las fotos son visibles para miembros. |
| 24 | Board, write a post | Posts can’t be edited. | Las publicaciones no se pueden editar. |
| 25 | Short facts, various screens | Organizers can read replies. · Only removes it here. · Opens after the event. · Check the highlighted fields. · Write a few words. · Use {email} for notifications? · Email isn't set up. · Blocked in phone settings. · Photo not usable. | (es alongside each in translations.eco.ts) |
| 26 | Profile + People | Bringing · Offering · Curious about · Search in · {n} of 120 | Traigo · Ofrezco · Me interesa · Buscar en · {n} de 120 |
| 27 | Notification messages (all looks) | The 3 notes were shortened in every look, not only ecology (they ship with #61, paused). | — |
