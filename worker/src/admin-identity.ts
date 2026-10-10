// Pure helpers for "who is this organizer, and where can mail reach them" —
// kept free of runtime imports so the newsletter module (and its tests) don't
// drag in the regenOS client.

import type { Session } from "./auth";

/** The inbox a test email can go to, or null when we have no address for them. */
export function sessionMailbox(session: Session): string | null {
  if (session.source === "regenos") return session.contactEmail ?? null;
  return session.email;
}

/**
 * What `test_sent_to` records for a test email. A regenOS organizer with no
 * mailbox of their own types an organizer notification address; the label ties
 * the test to the person who asked, so someone else sharing that inbox can't
 * unlock a send with it.
 */
export function testSentLabel(session: Session, address: string): string {
  return session.source === "regenos" && !session.contactEmail ? `${address} (via ${session.email})` : address;
}

/** Did this organizer send themselves the test recorded in `test_sent_to`? */
export function isOwnTest(session: Session, testSentTo: string | null): boolean {
  if (!testSentTo) return false;
  const mailbox = sessionMailbox(session);
  if (mailbox) return testSentTo === mailbox;
  return testSentTo.endsWith(` (via ${session.email})`);
}
