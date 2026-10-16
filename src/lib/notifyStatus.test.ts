import { describe, expect, it } from "vitest";
import { receivesNothing, type NoteView, type SettingsView } from "./notify";

const note = (over: Partial<NoteView> = {}): NoteView => ({ on: false, channel: "email", chosen: null, pushAvailable: false, phone: false, email: false, ...over });
const view = (over: Partial<SettingsView> = {}): SettingsView => ({
  email: { address: "a@b.org", verified: true, registered: true },
  push: { status: "none", installed: false, devices: 0, lastDeliveredAt: null, failedSince: 0, thisDevice: null },
  pushBroke: false, nothingReaches: false, locale: "en",
  notes: { morning: note(), harvest: note(), evening: note({ on: true, email: true }) },
  ...over,
});

describe("the notification status bar", () => {
  it("stays out of the way when the 8 PM note is on and reaches an address", () => {
    expect(receivesNothing(view())).toBe(false);
  });
  it("shows when every note is off", () => {
    expect(receivesNothing(view({ notes: { morning: note(), harvest: note(), evening: note() } }))).toBe(true);
  });
  it("shows when nothing can reach the person even though a note is on", () => {
    expect(receivesNothing(view({ nothingReaches: true }))).toBe(true);
  });
});
