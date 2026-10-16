// The events both calendar-desktop scripts need, created in the regenOS mock (never anywhere else).
export const LONG = "Supercalifragilisticexpialidocious Gathering of the Watershed Stewards and Friends of the Longest Event Title";
const SEED = [
  ["cd-opening", "Opening Invocation", "2026-10-15T23:00:00.000Z", "2026-10-16T01:00:00.000Z", "Boulder Creek Path"],
  ["cd-market", "Desktop Free Market", "2026-10-17T16:00:00.000Z", "2026-10-17T19:00:00.000Z", "Martin Park"],
  ["cd-skill", "Desktop Skill Share", "2026-10-17T19:00:00.000Z", "2026-10-17T23:00:00.000Z", "Martin Park"],
  ["cd-long", LONG, "2026-10-17T20:00:00.000Z", "2026-10-17T22:00:00.000Z", "The Community Gathering Hall at the Corner of Extremely-Long-Hyphenated-Street-Name-and-Another-One"],
];
export async function seedEvents(mock) {
  for (const [rkey, name, startsAt, endsAt, placeName] of SEED) {
    const r = await fetch(`${mock}/xrpc/social.scenius.createEvent`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mock-token" }, body: JSON.stringify({ authority: "did:plc:mockscene", rkey, name, description: "A real-enough description for the calendar lane, long enough to be clipped somewhere along the line when the row is narrow.", startsAt, endsAt, mode: "inperson", placeName, locality: "Boulder", region: "CO", attendance: "open" }) });
    if (!r.ok) { console.error(`could not seed the mock event ${rkey}: ${r.status}`); process.exit(2); }
  }
}
