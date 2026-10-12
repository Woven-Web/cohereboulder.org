import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.fn();
vi.mock("@/lib/api", () => ({ companionRequest: (...a: unknown[]) => request(...a) }));
const mem = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/companion", () => {
  return { anonymousDevice: () => "dev", localGet: (k: string) => mem.get(k) ?? null, localSet: (k: string, v: string) => void mem.set(k, v) };
});

const sub = { toJSON: () => ({ endpoint: "https://push.test/x", keys: { p256dh: "p", auth: "a" } }) };

beforeEach(() => {
  request.mockReset();
  mem.clear();
  vi.resetModules();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) } },
  });
});

describe("syncReminderLanguage", () => {
  it("PATCHes once per language change, not on every call", async () => {
    request.mockResolvedValue({});
    const { syncReminderLanguage } = await import("./reminders");
    await syncReminderLanguage("en");
    await syncReminderLanguage("en");
    await syncReminderLanguage("en");
    expect(request).toHaveBeenCalledTimes(1);
    await syncReminderLanguage("es");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("remembers the language it sent across page loads", async () => {
    request.mockResolvedValue({});
    await (await import("./reminders")).syncReminderLanguage("es");
    vi.resetModules();
    await (await import("./reminders")).syncReminderLanguage("es");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("a background failure sets no user notice and is retried next time", async () => {
    request.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    const { syncReminderLanguage, getReminderState } = await import("./reminders");
    expect(await syncReminderLanguage("en")).toBe(false);
    expect(getReminderState().notice).toBe("");
    await syncReminderLanguage("en");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
