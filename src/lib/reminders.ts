// Daily reminders (Web Push): one module-level store so Today, More, the install
// sheet and the shell's language sync all see the same subscription state and
// never double-send a request. The Worker side is /api/companion/subscriptions.
import { useSyncExternalStore } from "react";
import { companionRequest } from "@/lib/api";
import { anonymousDevice, localSet } from "@/lib/companion";

export type ReminderNotice = "" | "error" | "off";
export interface ReminderState {
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  busy: boolean;
  notice: ReminderNotice;
}

const supportedHere = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";

let state: ReminderState = {
  permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  subscribed: false,
  busy: false,
  notice: "",
};
const listeners = new Set<() => void>();
const publish = (patch: Partial<ReminderState>) => {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
};
const subscribeStore = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getReminderState = () => state;

const keyBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

let probed = false;
/** Learn whether this browser already holds a push subscription (once per page). */
export function probeSubscription(): void {
  if (probed || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  probed = true;
  navigator.serviceWorker
    .getRegistration()
    .then((r) => r?.pushManager?.getSubscription())
    .then((s) => publish({ subscribed: !!s }))
    .catch(() => {});
}

export function reminderSupport(pushKey: string | null | undefined): boolean {
  return supportedHere() && Boolean(pushKey);
}

export async function enableReminders(pushKey: string, language: string): Promise<void> {
  if (!supportedHere()) return;
  // Called synchronously from the button's gesture, before any await.
  const permissionRequest = Notification.requestPermission();
  publish({ busy: true, notice: "" });
  try {
    const result = await permissionRequest;
    publish({ permission: result });
    if (result !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(pushKey) }));
    const json = sub.toJSON();
    try {
      await companionRequest("subscriptions", { device_id: anonymousDevice(), endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, language });
    } catch (error) {
      await sub.unsubscribe();
      throw error;
    }
    publish({ subscribed: true });
    localSet("cohere-push-off", "false");
  } catch {
    publish({ notice: "error" });
  } finally {
    publish({ busy: false });
  }
}

export async function disableReminders(): Promise<void> {
  publish({ busy: true, notice: "" });
  try {
    // Remove the server endpoint first: if offline, keep the action available for retry.
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const json = sub?.toJSON();
    await companionRequest("subscriptions", { device_id: anonymousDevice(), ...(json ? { endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth } : {}) }, "DELETE");
    await sub?.unsubscribe();
    publish({ subscribed: false, notice: "off" });
    localSet("cohere-push-off", "true");
  } catch {
    publish({ notice: "error" });
  } finally {
    publish({ busy: false });
  }
}

/** Keep the stored subscription's language in step with the site's. Mount once. */
export async function syncReminderLanguage(language: string): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    const json = sub.toJSON();
    await companionRequest("subscriptions", { device_id: anonymousDevice(), endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, language }, "PATCH");
    return true;
  } catch {
    publish({ notice: "error" });
    return false;
  }
}

export function clearReminderNotice() {
  if (state.notice) publish({ notice: "" });
}

export const useReminders = () => useSyncExternalStore(subscribeStore, getReminderState, getReminderState);
