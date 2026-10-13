// The members directory and profiles: regenOS circle profiles
// (coop.lexicon.profile) for our collective, read and written through the
// /xrpc proxy. A member either has a COhere ("contextual") profile or shows
// their public scenius.social one ("publicFallback"); regenOS says which.

import type { ExtraKey } from "./api";
import { xrpcGet, xrpcPost } from "./regenos";

export const BIO_MAX = 256;
export const NAME_MAX = 64;
export const LINKS_MAX = 10;

export interface ProfileRecord {
  displayName?: string;
  bio?: string;
  links?: string[];
  createdAt?: string;
}

export interface DirectoryEntry {
  uri: string;
  cid: string;
  author: string;
  record: ProfileRecord;
  profileSource: "contextual" | "publicFallback";
}

export const PEOPLE_QUERY_KEY = ["people-directory"] as const;

/** Every readable profile, paged through. A non-member gets []. */
export async function fetchDirectory(collective: string): Promise<DirectoryEntry[]> {
  const out: DirectoryEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const data = await xrpcGet<{ records?: (Omit<DirectoryEntry, "profileSource"> & { profileSource?: string })[]; cursor?: string }>(
      "social.scenius.listCircleProfiles",
      { collective, limit: "100", ...(cursor ? { cursor } : {}) },
    );
    for (const r of data.records ?? []) {
      out.push({ ...r, profileSource: r.profileSource === "publicFallback" ? "publicFallback" : "contextual" });
    }
    cursor = data.cursor;
    if (!cursor) break;
  }
  return out;
}

export interface ProfileInput {
  displayName: string;
  bio: string;
  links: string[];
}

export function putProfile(collective: string, input: ProfileInput): Promise<{ uri: string; cid: string }> {
  const profile: ProfileRecord = {
    createdAt: new Date().toISOString(),
    ...(input.displayName.trim() ? { displayName: input.displayName.trim() } : {}),
    ...(input.bio.trim() ? { bio: input.bio.trim() } : {}),
    ...(input.links.length ? { links: input.links } : {}),
  };
  return xrpcPost("social.scenius.putCircleProfile", { collective, profile });
}

/** Back to the public profile: regenOS then returns public `self` as the fallback. */
export async function deleteProfile(collective: string): Promise<void> {
  await xrpcPost("social.scenius.deleteCircleProfile", { collective });
}

// --------------------------------------------------------------------- shape

export const graphemes = (text: string): number => {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<unknown> } }).Segmenter;
  return Segmenter ? [...new Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length : Array.from(text).length;
};

/** Lower-case, accent-stripped, for search that treats "José" and "jose" alike. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export const EXTRA_KEYS = ["bringing", "offering", "curious"] as const;
export const EXTRA_MAX = 120;
export const PEOPLE_EXTRAS_KEY = ["people-extras"] as const;

/**
 * Search the directory. With no `field`, the text may match the name, bio or any
 * of the three extra lines; with one, it applies to that line only (and an empty
 * query then lists everyone who has filled that line in).
 */
export function matchesSearch(entry: DirectoryEntry, name: string, query: string, extras?: Partial<Record<ExtraKey, string>>, field?: ExtraKey | null): boolean {
  const q = fold(query.trim());
  if (field) {
    const line = extras?.[field] ?? "";
    return Boolean(line) && fold(line).includes(q);
  }
  if (!q) return true;
  const lines = EXTRA_KEYS.map((key) => extras?.[key] ?? "").join(" ");
  return fold(`${name} ${entry.record.bio ?? ""} ${lines}`).includes(q);
}

/**
 * A profile link is shown only if it is http(s) or mailto. regenOS accepts any
 * URI for `links`, and profiles can be written from other apps, so this is the
 * only thing standing between a `javascript:` link and a member's click.
 */
export function safeLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Editor input → links worth saving: trimmed, http(s) only, de-duplicated, capped. */
export function cleanLinks(raw: string[]): { links: string[]; rejected: string[] } {
  const links: string[] = [];
  const rejected: string[] = [];
  for (const value of raw.map((v) => v.trim()).filter(Boolean)) {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    let safe: string | null = null;
    try {
      safe = ["http:", "https:"].includes(new URL(withScheme).protocol) ? new URL(withScheme).href : null;
    } catch {
      safe = null;
    }
    if (!safe) rejected.push(value);
    else if (!links.includes(safe)) links.push(safe);
  }
  return { links: links.slice(0, LINKS_MAX), rejected };
}

export function linkLabel(href: string): string {
  try {
    const url = new URL(href);
    return url.protocol === "mailto:" ? url.pathname : url.host.replace(/^www\./, "") + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return href;
  }
}

/** Name to show for a profile: its own displayName, else whatever the roster knows. */
export function entryName(entry: DirectoryEntry, fallback: string): string {
  return entry.record.displayName?.trim() || fallback;
}
