import { describe, expect, it } from "vitest";
import { addEmailPatch, offerEmailToo, receivesNothing, type NoteView, type SettingsView } from "./notify";

const note = (over: Partial<NoteView> = {}): NoteView => ({ on: false, channel: "email", chosen: null, pushAvailable: false, phone: false, email: false, ...over });
const view = (over: Partial<SettingsView> = {}): SettingsView => ({
  email: { address: "a@b.org", verified: true, registered: true },
  push: { status: "none", installed: false, devices: 0, lastDeliveredAt: null, failedSince: 0, thisDevice: null },
  pushBroke: false, nothingReaches: false, locale: "en",
  notes: { morning: note(), reminder: note(), harvest: note(), evening: note({ on: true, email: true }) },
  ...over,
});

describe("the notification status bar", () => {
  it("stays out of the way when the 8 PM note is on and reaches an address", () => {
    expect(receivesNothing(view())).toBe(false);
  });
  it("shows when every note is off", () => {
    expect(receivesNothing(view({ notes: { morning: note(), reminder: note(), harvest: note(), evening: note() } }))).toBe(true);
  });
  it("shows when nothing can reach the person even though a note is on", () => {
    expect(receivesNothing(view({ nothingReaches: true }))).toBe(true);
  });
});

describe("event reminders in the status bar", () => {
  it("count as a note that reaches you", () => {
    expect(receivesNothing(view({ notes: { morning: note(), reminder: note({ on: true, phone: true }), harvest: note(), evening: note() } }))).toBe(false);
  });
  it("a settings view from before reminders existed still reads", () => {
    const old = view({ notes: { morning: note(), harvest: note(), evening: note() } as SettingsView["notes"] });
    expect(receivesNothing(old)).toBe(true);
  });
});

describe("'Now on your phone. Want email too?'", () => {
  const live = { status: "live" as const, installed: true, devices: 1, lastDeliveredAt: null, failedSince: 0, thisDevice: null };
  const onPhone = note({ on: true, channel: "push", pushAvailable: true, phone: true });
  const phoneView = (over: Partial<SettingsView> = {}) => view({ push: live, notes: { morning: onPhone, reminder: onPhone, harvest: onPhone, evening: onPhone }, ...over });

  it("shows once the live phone has taken the notes by default, and the tap adds email to each of them", () => {
    expect(offerEmailToo(phoneView())).toBe(true);
    expect(addEmailPatch(phoneView())).toEqual({
      morning: { channels: { phone: true, email: true } }, reminder: { channels: { phone: true, email: true } },
      harvest: { channels: { phone: true, email: true } }, evening: { channels: { phone: true, email: true } },
    });
  });
  it("leaves alone a note the person chose, a note that is off, and one already by email", () => {
    const v = phoneView({ notes: { morning: note(), reminder: { ...onPhone, chosen: "push" }, harvest: { ...onPhone, email: true }, evening: onPhone } });
    expect(addEmailPatch(v)).toEqual({ evening: { channels: { phone: true, email: true } } });
  });
  it("does not show without a live phone, without an address, or once every note has a choice", () => {
    expect(offerEmailToo(view())).toBe(false);
    expect(offerEmailToo(phoneView({ push: { ...live, status: "suspect" } }))).toBe(false);
    expect(offerEmailToo(phoneView({ email: { address: null, verified: false, registered: false } }))).toBe(false);
    const chosen = { ...onPhone, chosen: "push" as const };
    expect(offerEmailToo(phoneView({ notes: { morning: chosen, reminder: chosen, harvest: chosen, evening: chosen } }))).toBe(false);
  });
});
