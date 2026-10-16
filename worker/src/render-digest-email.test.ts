// Renders the 8 PM digest for a full day to shots-email-default/digest-email.html (run by hand:
// RENDER_DIGEST=shots-email-default npx vitest run worker/src/render-digest-email.test.ts). Skipped otherwise.
import { writeFileSync } from "node:fs";
import { describe, it, vi } from "vitest";

vi.mock("cloudflare:email", () => ({ EmailMessage: class {} }));

import { eveningEmail, type EventLine } from "./notify-messages";

const out = process.env.RENDER_DIGEST;
const line = (rkey: string, name: string, h: number, going = false, where: string | null = "Boulder Public Library"): EventLine => ({
  did: "did:plc:scene", rkey, name, where, going,
  startsAt: `2026-10-17T${String(h + 6).padStart(2, "0")}:00:00Z`, endsAt: `2026-10-17T${String(h + 7).padStart(2, "0")}:00:00Z`,
});

describe.skipIf(!out)("digest email render", () => {
  it("writes the html", () => {
    const base = "https://cohereboulder.org";
    const message = eveningEmail(
      {
        date: "2026-10-17", lang: "en",
        daily: { title: "Learn three neighbours’ names", body: "Learn the names of three neighbours. Say them out loud twice.", title_es: null, body_es: null, question: null, question_es: null },
        events: [line("a", "Honoring Water | with Angelique", 9, true), line("b", "Soup Night", 13), line("c", "Song Circle", 15, false, "Chautauqua Green")],
        toShare: [line("w", "Morning Walk | with Sam", 8)],
        harvestsToday: 3,
      },
      { lang: "en", to: "rae@example.org", base, settingsUrl: `${base}/more/notifications`, unsubUrl: `${base}/n/token`, fellBack: false, pushSettingsUrl: `${base}/more/notifications` },
      (e) => `${base}/n/rsvp-${e.rkey}`,
    );
    writeFileSync(`${out}/digest-email.html`, message.html);
    writeFileSync(`${out}/digest-email.txt`, `Subject: ${message.subject}\n\n${message.text}\n`);
  });
});
