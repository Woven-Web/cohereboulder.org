// Harvests: a member's few words (and one optional photo) about an event they
// went to. Members only; they live in COhere's own database, not on regenOS
// (worker/src/harvest.ts says why). Reports and steward hiding reuse the
// Board's: a harvest's report/moderation key is `cohere:harvest/<id>`.

import { API_BASE } from "@/lib/api";
import { XrpcError } from "@/lib/regenos";
import { localGet, localSet } from "@/lib/companion";

export const HARVEST_TEXT_MAX = 600;
export const HARVESTS_KEY = ["harvests"] as const;
export const MY_HARVESTS_KEY = ["my-harvests"] as const;
export const RECENT_EVENTS_KEY = ["harvest-recent-events"] as const;

export interface Harvest {
  id: string;
  eventDid: string;
  eventRkey: string;
  eventName: string;
  authorDid: string;
  body: string;
  prompt: "event" | "inquiry";
  lang: string;
  hasPhoto: boolean;
  createdAt: string;
  editedAt: string | null;
  mine: boolean;
  /** Set only for the author, who still sees a hidden/removed harvest, marked. */
  moderation?: "hidden" | "removed";
}

export interface RecentEvent {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  where: string | null;
}

/** When an event is over: its end, else an hour after it starts. */
export function eventEndedAt(event: { startsAt: string | null; endsAt: string | null }): number | null {
  const end = Date.parse(event.endsAt ?? "");
  if (!Number.isNaN(end)) return end;
  const start = Date.parse(event.startsAt ?? "");
  return Number.isNaN(start) ? null : start + 3_600_000;
}

export const harvestUri = (id: string) => `cohere:harvest/${id}`;
export const photoUrl = (id: string) => `${API_BASE}/api/harvests/${encodeURIComponent(id)}/photo`;

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/harvests${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new XrpcError(res.status, null, data?.error ?? `harvests answered ${res.status}`);
  return data as T;
}

export const fetchHarvests = async (did: string, rkey: string) =>
  (await call<{ harvests: Harvest[] }>(`?event=${encodeURIComponent(did)}/${encodeURIComponent(rkey)}`)).harvests;
export const fetchMyHarvests = async () => (await call<{ harvests: { id: string; eventDid: string; eventRkey: string }[] }>("/mine")).harvests;
export const fetchRecentEvents = async () => (await call<{ events: RecentEvent[] }>("/recent")).events;

export interface NewHarvest {
  eventDid: string;
  eventRkey: string;
  body: string;
  prompt: "event" | "inquiry";
  lang: string;
  /** A data: URL of a JPEG, already shrunk. */
  photo?: string | null;
}
export const createHarvest = async (input: NewHarvest) => (await call<{ harvest: Harvest }>("", "POST", input)).harvest;
export const editHarvest = async (id: string, patch: { body?: string; photo?: string | null }) =>
  (await call<{ harvest: Harvest }>(`/${encodeURIComponent(id)}`, "PATCH", patch)).harvest;
export const deleteHarvest = (id: string) => call<{ ok: true }>(`/${encodeURIComponent(id)}`, "DELETE");

// ------------------------------------------------------------------ photos

const PHOTO_EDGE = 1280;
const PHOTO_LIMIT = 350_000;

/**
 * Shrink a chosen picture to a JPEG that fits the Worker's limit. Re-drawing it
 * on a canvas also drops everything the camera embedded (location, device).
 * Rejects if the browser can't read it.
 */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    for (const edge of [PHOTO_EDGE, 1000, 800, 600]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const url = canvas.toDataURL("image/jpeg", quality);
        if (url.startsWith("data:image/jpeg;base64,") && Math.ceil(((url.length - 23) * 3) / 4) <= PHOTO_LIMIT) return url;
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error("photo too large");
}

// ------------------------------------------------------- "Not now" memory

const DISMISSED_KEY = "cohere-harvest-dismissed";

export function dismissedHarvestCards(): string[] {
  try {
    const value: unknown = JSON.parse(localGet(DISMISSED_KEY) || "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function dismissHarvestCard(eventKey: string): string[] {
  const next = [...new Set([...dismissedHarvestCards(), eventKey])].slice(-50);
  localSet(DISMISSED_KEY, JSON.stringify(next));
  return next;
}

/** The harvest prompt for the day's inquiry: the day's question, if there is one. */
export function inquiryPrompt(question: string | undefined | null): string | null {
  return question?.trim() || null;
}
