// The members Board: posts and replies are regenOS circle records
// (coop.lexicon.post, member-owned), read and written through our own
// /xrpc proxy so the visitor's regenOS session rides along. COhere-side
// moderation (worker/src/board-moderation.ts) is applied by the Worker before
// a response reaches us; an author's own moderated post comes back marked.

import { API_BASE } from "./api";
import { XrpcError, xrpcGet, xrpcPost } from "./regenos";

export const BOARD_POSTS_QUERY_KEY = ["board-posts"] as const;

export type Moderation = "hidden" | "removed" | "pending";

export interface StrongRef {
  uri: string;
  cid: string;
}

export interface PostRecord {
  text: string;
  title?: string;
  tags?: string[];
  langs?: string[];
  createdAt: string;
  reply?: { root: StrongRef; parent: StrongRef };
  subject?: StrongRef;
}

export interface BoardPost {
  uri: string;
  cid: string;
  author: string;
  record: PostRecord;
  /** Set by the Worker, only for the post's own author. */
  cohereModeration?: Moderation;
}

/** The fixed tag chips; the lexicon allows free tags, the Board offers these. */
export const BOARD_TAGS = ["rideshare", "offers", "asks", "harvest", "gratitude"] as const;
export type BoardTag = (typeof BOARD_TAGS)[number];

export const REPORT_REASONS = ["spam", "unkind", "private_info", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_NOTE_MAX = 500;
export const POST_TEXT_MAX = 5000;
export const POST_TITLE_MAX = 100;

const TAG_ES: Record<string, string> = { rideshare: "aventón", offers: "ofertas", asks: "peticiones", harvest: "cosecha", gratitude: "gratitud" };

export function tagLabel(tag: string, language: "en" | "es"): string {
  return language === "es" ? TAG_ES[tag] ?? tag : tag;
}

export const postPath = (post: Pick<BoardPost, "author" | "uri">) => `/board/${encodeURIComponent(post.author)}/${encodeURIComponent(rkeyOf(post.uri))}`;

export const rkeyOf = (uri: string) => uri.slice(uri.lastIndexOf("/") + 1);
export const authorOfUri = (uri: string) => uri.slice("at://".length).split("/")[0];

// ---------------------------------------------------------------------- wire

const PAGE_CAP = 10;

async function fetchPages(nsid: string, params: Record<string, string>): Promise<BoardPost[]> {
  const out: BoardPost[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < PAGE_CAP; page++) {
    const data = await xrpcGet<{ records?: BoardPost[]; cursor?: string }>(nsid, {
      ...params,
      limit: "100",
      ...(cursor ? { cursor } : {}),
    });
    out.push(...(data.records ?? []));
    cursor = data.cursor;
    if (!cursor) break;
  }
  return out;
}

/** Every readable post and reply, oldest first (regenOS lists in URI order). A non-member gets []. */
export function fetchPosts(collective: string): Promise<BoardPost[]> {
  return fetchPages("social.scenius.listCirclePosts", { collective });
}

/** A root and its replies, or null when the root isn't readable (deleted, hidden, or not yours to see). */
export async function fetchThread(collective: string, root: string): Promise<BoardPost[] | null> {
  try {
    const records = await fetchPages("social.scenius.getCircleThread", { collective, root });
    return records.some((r) => r.uri === root) ? records : null;
  } catch (err) {
    if (err instanceof XrpcError && err.status === 404) return null;
    throw err;
  }
}

export interface NewPost {
  text: string;
  title?: string;
  tags?: string[];
  lang: string;
  reply?: { root: StrongRef; parent: StrongRef };
}

export function createPost(collective: string, input: NewPost): Promise<StrongRef> {
  const post: PostRecord = {
    text: input.text.trim(),
    createdAt: new Date().toISOString(),
    langs: [input.lang],
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.reply ? { reply: input.reply } : {}),
  };
  return xrpcPost<StrongRef>("social.scenius.createCirclePost", { collective, post });
}

export async function deletePost(collective: string, uri: string): Promise<void> {
  await xrpcPost("social.scenius.deleteCirclePost", { collective, rkey: rkeyOf(uri) });
}

export async function reportPost(input: { uri: string; reason: ReportReason; note?: string; excerpt?: string }): Promise<void> {
  const res = await fetch(`${API_BASE}/api/board/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new XrpcError(res.status, null, body?.error ?? `report answered ${res.status}`);
  }
}

// ------------------------------------------------------------------- shaping

const isReply = (p: BoardPost) => Boolean(p.record.reply);
const byNewest = (a: BoardPost, b: BoardPost) => (a.record.createdAt < b.record.createdAt ? 1 : a.record.createdAt > b.record.createdAt ? -1 : 0);

/** Root posts, newest first, plus how many replies each has. */
export function splitFeed(records: BoardPost[]): { roots: BoardPost[]; replyCounts: Map<string, number> } {
  const replyCounts = new Map<string, number>();
  for (const r of records) {
    const root = r.record.reply?.root.uri;
    if (root) replyCounts.set(root, (replyCounts.get(root) ?? 0) + 1);
  }
  return { roots: records.filter((r) => !isReply(r)).sort(byNewest), replyCounts };
}

export function tagCounts(roots: BoardPost[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const post of roots) for (const tag of new Set(post.record.tags ?? [])) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return counts;
}

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYY-MM-DD in Denver for an ISO instant. */
export function denverDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dayFormat.format(d);
}

export interface DayGroup {
  day: string;
  posts: BoardPost[];
}

/** Consecutive same-day posts (input newest first) grouped for the dated feed. */
export function groupByDay(posts: BoardPost[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const post of posts) {
    const day = denverDay(post.record.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.posts.push(post);
    else groups.push({ day, posts: [post] });
  }
  return groups;
}

export interface ThreadReply {
  post: BoardPost;
  /** The post being answered, when it isn't the root — for the "replying to" line. */
  parent: BoardPost | null;
}

/** Replies oldest first, each with its non-root parent resolved. */
export function threadReplies(records: BoardPost[], rootUri: string): ThreadReply[] {
  const byUri = new Map(records.map((r) => [r.uri, r]));
  return records
    .filter((r) => r.record.reply?.root.uri === rootUri)
    .sort((a, b) => (a.record.createdAt < b.record.createdAt ? -1 : 1))
    .map((post) => {
      const parentUri = post.record.reply?.parent.uri;
      return { post, parent: parentUri && parentUri !== rootUri ? byUri.get(parentUri) ?? null : null };
    });
}

export function initials(name: string): string {
  const parts = name.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = (parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? "?"]).map((p) => Array.from(p)[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function shortDid(did: string): string {
  return did.replace(/^did:[a-z]+:/, "").slice(0, 8);
}

export function excerptOf(post: BoardPost): string {
  const text = (post.record.title ? `${post.record.title}. ` : "") + post.record.text;
  return Array.from(text).slice(0, 280).join("");
}
