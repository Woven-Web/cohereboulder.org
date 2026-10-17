# Walkthrough: the Subscribe to calendar dialog in the ecology look

## How to run it

Local, against the regenOS mock (nothing leaves the machine):

```bash
npm run build
PORT=9945 node scripts/regenos-mock.mjs &
npx wrangler dev --port 8795 --var REGENOS_LOGIN_ENABLED:true \
  --var REGENOS_BASE_URL:http://127.0.0.1:9945 --var REGENOS_COLLECTIVE_DID:did:plc:mockscene
```

Open http://127.0.0.1:8795/calendar?look=ecology. (Local servers default to the classic look, so add
`?look=ecology`. After deploy it is the default.) The screenshots come from
`node scripts/ecology-e2e.mjs <worker> <mock> <dir>` on the real build.

## Steps

1. **Before.** Screen: `shots-subscribe/before-subscribe-event-en-390.png`.
   Narration: "This is how Subscribe to calendar looked: a plain white box, blue buttons and system font, unlike the rest of the app."

2. **Calendar page, phone.** Tap *Subscribe to calendar* under the day list. Screen: `shots-subscribe/subscribe-calendar-en-390.png`.
   Narration: "Now it matches the sign-in dialog: a cream card, the Lora heading and Poppins text."

3. **The buttons.** Same screen, point at Google, then Apple, then Copy.
   Narration: "Google is the forest-green pill. Apple and Copy are outlined pills. Each one is big enough to tap."

4. **Spanish.** Switch to ES on an event page and open it again. Screen: `shots-subscribe/subscribe-event-es-390.png`.
   Narration: "In Spanish the longer labels still fit, and the close button is labelled in Spanish too."

5. **Laptop.** Screen: `shots-subscribe/subscribe-calendar-en-1280.png`.
   Narration: "On a laptop it's the same card, centred over the calendar."
