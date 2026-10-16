// What the three notes say, as a push and as an email, in English and Spanish.
// Pure: given the day's content and the person, return text. (Spanish has not
// had a native-speaker pass, like the rest of the Spanish in the app.)

import { mailShell, type MailMessage } from "./auth";
import type { PushPayload } from "./push";
import { TZ, addDays, type NotifyType } from "./notify-core";

export type Lang = "en" | "es";

export interface EventLine {
  did: string;
  rkey: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  where: string | null;
  /** The person RSVP'd (account RSVP, or an email RSVP for this address). */
  going: boolean;
}

export interface Daily {
  title: string;
  body: string;
  title_es: string | null;
  body_es: string | null;
  question: string | null;
  question_es: string | null;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v: string, n: number) => Array.from(v).slice(0, n).join("");

/** "Honoring Water | with Angelique" → "Honoring Water". */
export const shortName = (name: string) => name.split(/ \| | -- | — /)[0].trim() || name;

const FIRST = "2026-10-15";
/** 1…11 inside the gathering; 0 before. */
export function dayNumber(date: string): number {
  const n = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${FIRST}T12:00:00Z`)) / 86_400_000) + 1;
  return n < 1 ? 0 : n;
}

export function timeOf(iso: string | null, lang: Lang): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function dateLabel(date: string, lang: Lang, long = false): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: "UTC", ...(long ? { weekday: "long" } : {}), month: long ? "long" : "short", day: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

const sentences = (s: string) => (s.match(/[^.!?]+[.!?]+/g) ?? [s]).map((x) => x.trim()).filter(Boolean);

const T = {
  en: {
    day: "Day", thenAsk: "Then ask:", settings: "Settings", openToday: "Open Today", rsvpTomorrow: "RSVP for tomorrow", share: "Share harvest",
    going: "going", more: (n: number) => `+ ${n} more event${n === 1 ? "" : "s"} today`, moreTomorrow: (n: number) => `+ ${n} more`,
    youreGoing: "You’re going", eventsToday: "Today’s events", also: "Also", alsoToday: "Also today", alsoTomorrow: "Also tomorrow", yourEvents: "Your events today",
    practice: "Today’s practice", dayOf: (n: number, d: string) => `Day ${n} of 11 · ${d}`, openTodayLink: "Open Today in COhere",
    details: "Details", imGoing: "I’m going", rsvp: "RSVP: I’m going",
    readyTitle: "Ready for tomorrow?", readyBody: (n: number, d: string, m: number) => `${n} event${n === 1 ? "" : "s"} · ${d} · going to ${m}`,
    readyMail: (d: string) => d, openTomorrow: "Open tomorrow in COhere",
    harvestTitle: (n: string) => `How was ${n}?`, harvestBody: "Share your harvest.", harvestLine: "",
    harvestMail: (e: string, w: string | null) => `<b>${e}</b>${w ? ` · ${w}` : ""}`,
    harvestAsk: "How was it?", harvestLink: "Share your harvest",
    harvestVis: "Harvests show your name.",
    names: { morning: "Morning note", harvest: "Harvest invitation", evening: "Ready for tomorrow" } as Record<NotifyType, string>,
    because: (name: string, to: string) => `${name} · ${to}`,
    change: "Change your settings", unsub: () => "Unsubscribe", tomorrowPractice: "Tomorrow’s practice",
    fellBack: "Push failed. Sent by email.", fellBackLink: "Turn push back on",
    subjectMorning: (n: number, t: string) => `Day ${n}: ${t}`,
    subjectHarvest: (n: string) => `How was ${n}?`,
    subjectDigest: (d: string) => `Tomorrow at COhere: ${d}`,
    shareHarvest: "Share a harvest", newHarvests: "New harvests today",
    harvestsToday: (n: number) => (n === 1 ? "1 person shared a harvest today" : `${n} people shared harvests today`),
    testTitle: "Push is working", testBody: "Test from COhere.",
    verifySubject: "Confirm your email", verifyHeading: "Is this your email?", verifyBody: "Confirm this address.",
    verifyLink: "Yes, use this address", verifyFoot: "If you didn’t ask for this, ignore it.",
    optinLead: "Evening and harvest notes?", optinBody: "",
    optinLink: "Yes, send them",
  },
  es: {
    day: "Día", thenAsk: "Luego pregúntate:", settings: "Ajustes", openToday: "Abrir Hoy", rsvpTomorrow: "RSVP para mañana", share: "Compartir cosecha",
    going: "voy", more: (n: number) => `+ ${n} evento${n === 1 ? "" : "s"} más hoy`, moreTomorrow: (n: number) => `+ ${n} más`,
    youreGoing: "Vas a", eventsToday: "Los eventos de hoy", also: "También", alsoToday: "También hoy", alsoTomorrow: "También mañana", yourEvents: "Tus eventos de hoy",
    practice: "La práctica de hoy", dayOf: (n: number, d: string) => `Día ${n} de 11 · ${d}`, openTodayLink: "Abrir Hoy en COhere",
    details: "Detalles", imGoing: "Voy", rsvp: "RSVP: voy",
    readyTitle: "¿Lista para mañana?", readyBody: (n: number, d: string, m: number) => `${n} evento${n === 1 ? "" : "s"} · ${d} · voy a ${m}`,
    readyMail: (d: string) => d, openTomorrow: "Abrir mañana en COhere",
    harvestTitle: (n: string) => `¿Cómo estuvo ${n}?`, harvestBody: "Comparte tu cosecha.", harvestLine: "",
    harvestMail: (e: string, w: string | null) => `<b>${e}</b>${w ? ` · ${w}` : ""}`,
    harvestAsk: "¿Cómo estuvo?", harvestLink: "Comparte tu cosecha",
    harvestVis: "Las cosechas muestran tu nombre.",
    names: { morning: "Nota de la mañana", harvest: "Invitación a la cosecha", evening: "Lista para mañana" } as Record<NotifyType, string>,
    because: (name: string, to: string) => `${name} · ${to}`,
    change: "Cambiar tus ajustes", unsub: () => "Darte de baja", tomorrowPractice: "La práctica de mañana",
    fellBack: "Falló el push. Enviado por correo.", fellBackLink: "Reactivar los avisos push",
    subjectMorning: (n: number, t: string) => `Día ${n}: ${t}`,
    subjectHarvest: (n: string) => `¿Cómo estuvo ${n}?`,
    subjectDigest: (d: string) => `Mañana en COhere: ${d}`,
    shareHarvest: "Comparte una cosecha", newHarvests: "Cosechas nuevas de hoy",
    harvestsToday: (n: number) => (n === 1 ? "1 persona compartió una cosecha hoy" : `${n} personas compartieron cosechas hoy`),
    testTitle: "El push funciona", testBody: "Prueba de COhere.",
    verifySubject: "Confirma tu correo", verifyHeading: "¿Es este tu correo?", verifyBody: "Confirma esta dirección.",
    verifyLink: "Sí, usar esta dirección", verifyFoot: "Si no lo pediste, ignóralo.",
    optinLead: "¿Avisos de la noche y la cosecha?", optinBody: "",
    optinLink: "Sí, enviar",
  },
} as const;

export const copy = (lang: Lang) => T[lang];

// ---------------------------------------------------------------- shared

export interface MailContext {
  lang: Lang;
  /** The address it goes to, shown in the footer. */
  to: string;
  base: string;
  /** /n/<token> pages */
  settingsUrl: string;
  unsubUrl: string;
  /** First fallback after being live: one line on top. */
  fellBack: boolean;
  /** Where "Turn push back on" lands. */
  pushSettingsUrl: string;
}

const P = 'style="margin:0 0 14px;line-height:1.6"';
const A = 'style="color:#36558F"';
const H = 'style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#5f6368;margin:18px 0 6px"';
const eventUrl = (base: string, e: EventLine) => `${base}/events/${encodeURIComponent(e.did)}/${encodeURIComponent(e.rkey)}`;

function frame(type: NotifyType, ctx: MailContext, heading: string, bodyHtml: string, bodyText: string, subject: string): MailMessage {
  const c = T[ctx.lang];
  const name = c.names[type];
  const top = ctx.fellBack ? `<p ${P}><i>${esc(c.fellBack)}</i> <a href="${esc(ctx.pushSettingsUrl)}" ${A}>${esc(c.fellBackLink)}</a></p>` : "";
  const topText = ctx.fellBack ? `${c.fellBack} ${c.fellBackLink}: ${ctx.pushSettingsUrl}\n\n` : "";
  const footer = `${esc(c.because(name, ctx.to))}<br><a href="${esc(ctx.settingsUrl)}" ${A}>${esc(c.change)}</a> · <a href="${esc(ctx.unsubUrl)}" ${A}>${esc(c.unsub())}</a>`;
  return {
    subject,
    html: mailShell(esc(heading), top + bodyHtml, footer),
    text: `${topText}${bodyText}\n\n${c.because(name, ctx.to)}\n${c.change}: ${ctx.settingsUrl}\n${c.unsub()}: ${ctx.unsubUrl}`,
    headers: { "List-Unsubscribe": `<${ctx.unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

const eventLi = (e: EventLine, ctx: MailContext, link: { href: string; label: string }) =>
  `<li style="padding:6px 0;border-top:1px solid #eee"><b>${esc(timeOf(e.startsAt, ctx.lang))}</b> ${esc(e.name)}<br>` +
  `<span style="color:#5f6368;font-size:14px">${e.where ? `${esc(e.where)} · ` : ""}${e.going ? `${esc(T[ctx.lang].going)} · ` : ""}<a href="${esc(link.href)}" ${A}>${esc(link.label)}</a></span></li>`;
const eventText = (e: EventLine, lang: Lang, href: string) =>
  `${timeOf(e.startsAt, lang)} ${e.name}${e.where ? ` · ${e.where}` : ""}${e.going ? ` · ${T[lang].going}` : ""}\n${href}`;

/** Going first, then by start time. */
export function ordered(events: EventLine[]): EventLine[] {
  return [...events].sort((a, b) => Number(b.going) - Number(a.going) || (Date.parse(a.startsAt ?? "") || 0) - (Date.parse(b.startsAt ?? "") || 0));
}

// ----------------------------------------------------------------- morning

export interface MorningInput {
  date: string;
  daily: Daily;
  events: EventLine[];
  lang: Lang;
}

function practiceLines(input: MorningInput) {
  const es = input.lang === "es";
  const title = (es ? input.daily.title_es : null) || input.daily.title;
  const body = (es ? input.daily.body_es : null) || input.daily.body || "";
  const question = (es ? input.daily.question_es : null) || input.daily.question || "";
  return { title, body, question };
}

export function morningPush(input: MorningInput, deviceId?: string): PushPayload {
  const c = T[input.lang];
  const { title, body, question } = practiceLines(input);
  const first = body ? sentences(body)[0] : "";
  const one = [first, question ? `${c.thenAsk} ${question}` : ""].filter(Boolean).join(" ");
  const events = ordered(input.events);
  const mine = events.filter((e) => e.going);
  const lines = [
    ...mine.map((e) => `${timeOf(e.startsAt, input.lang)} ${shortName(e.name)} · ${c.going}`),
    ...(events.length - mine.length > 0 ? [c.more(events.length - mine.length)] : []),
  ];
  return {
    title: clip(`${c.day} ${dayNumber(input.date)} · ${title}`, 200),
    body: clip([one, lines.join("\n")].filter(Boolean).join("\n\n"), 1000),
    url: "/today", tag: `${input.date}-morning`,
    ...(deviceId ? { device: deviceId } : {}),
    actions: [{ action: "open", title: c.openToday }, { action: "settings", title: c.settings }],
  };
}

export function morningEmail(input: MorningInput, ctx: MailContext): MailMessage {
  const c = T[ctx.lang];
  const { title, body, question } = practiceLines(input);
  const events = ordered(input.events);
  const mine = events.filter((e) => e.going), rest = events.filter((e) => !e.going);
  const link = (e: EventLine) => ({ href: eventUrl(ctx.base, e), label: e.going ? c.details : c.imGoing });
  const html =
    `<p ${P}>${esc(c.dayOf(dayNumber(input.date), dateLabel(input.date, ctx.lang, true)))}</p>` +
    `<h4 ${H}>${esc(c.practice)}</h4><p ${P}><b>${esc(title)}</b><br>${esc(body)}</p>` +
    (question ? `<p ${P}><i>${esc(question)}</i></p>` : "") +
    (mine.length ? `<h4 ${H}>${esc(c.yourEvents)}</h4><ul style="margin:0 0 12px;padding:0;list-style:none">${mine.map((e) => eventLi(e, ctx, link(e))).join("")}</ul>` : "") +
    (rest.length ? `<h4 ${H}>${esc(mine.length ? c.alsoToday : c.eventsToday)}</h4><ul style="margin:0 0 12px;padding:0;list-style:none">${rest.map((e) => eventLi(e, ctx, link(e))).join("")}</ul>` : "") +
    `<p ${P}><a href="${esc(`${ctx.base}/today`)}" ${A}>${esc(c.openTodayLink)}</a></p>`;
  const text = [
    c.dayOf(dayNumber(input.date), dateLabel(input.date, ctx.lang, true)), "", title, body, question ? `\n${question}` : "", "",
    ...(mine.length ? [c.yourEvents, ...mine.map((e) => eventText(e, ctx.lang, eventUrl(ctx.base, e))), ""] : []),
    ...(rest.length ? [c.alsoToday, ...rest.map((e) => eventText(e, ctx.lang, eventUrl(ctx.base, e))), ""] : []),
    `${c.openTodayLink}: ${ctx.base}/today`,
  ].join("\n");
  return frame("morning", ctx, `${c.day} ${dayNumber(input.date)} · ${title}`, html, text, c.subjectMorning(dayNumber(input.date), title));
}

// ----------------------------------------------------------------- evening

export interface EveningInput {
  /** The day being described (tomorrow). */
  date: string;
  events: EventLine[];
  /** Tomorrow's practice, if the organizers wrote one. The email carries it word for word. */
  daily?: Daily | null;
  /** Today's events that have ended and this person went to without sharing a harvest yet (email only). */
  toShare?: EventLine[];
  /** How many harvests were shared today (email only; a count and a link, never anyone's words). */
  harvestsToday?: number;
  lang: Lang;
}

export function eveningPush(input: EveningInput, deviceId?: string): PushPayload {
  const c = T[input.lang];
  const events = ordered(input.events);
  const mine = events.filter((e) => e.going), rest = events.filter((e) => !e.going);
  const fmt = (e: EventLine) => `${timeOf(e.startsAt, input.lang).replace(":00", "")} ${shortName(e.name)}`;
  const also = rest.slice(0, 2);
  const lines = [
    ...(mine.length ? [`${c.youreGoing} ${mine.map(fmt).join(" · ")}`] : []),
    ...(rest.length ? [`${c.also} ${also.map(fmt).join(" · ")}${rest.length > also.length ? ` · ${c.moreTomorrow(rest.length - also.length)}` : ""}`] : []),
  ];
  return {
    title: c.readyTitle,
    body: clip([c.readyBody(events.length, dateLabel(input.date, input.lang), mine.length), lines.join("\n")].join("\n\n"), 1000),
    url: "/tomorrow", tag: `${addDays(input.date, -1)}-evening`,
    ...(deviceId ? { device: deviceId } : {}),
    actions: [{ action: "open", title: c.rsvpTomorrow }, { action: "settings", title: c.settings }],
  };
}

export function eveningEmail(input: EveningInput, ctx: MailContext, rsvpLink: (e: EventLine) => string): MailMessage {
  const c = T[ctx.lang];
  const events = ordered(input.events);
  const mine = events.filter((e) => e.going), rest = events.filter((e) => !e.going);
  const share = input.toShare ?? [];
  const count = input.harvestsToday ?? 0;
  const practice = input.daily?.title ? practiceLines({ date: input.date, daily: input.daily, events: [], lang: ctx.lang }) : null;
  const ul = 'style="margin:0 0 12px;padding:0;list-style:none"';
  const todayUrl = `${ctx.base}/today`;
  const html =
    `<p ${P}>${esc(c.readyMail(dateLabel(input.date, ctx.lang, true)))}</p>` +
    (practice ? `<h4 ${H}>${esc(c.tomorrowPractice)}</h4><p ${P}><b>${esc(practice.title)}</b><br>${esc(practice.body)}</p>` : "") +
    (mine.length ? `<h4 ${H}>${esc(c.youreGoing)}</h4><ul ${ul}>${mine.map((e) => eventLi(e, ctx, { href: eventUrl(ctx.base, e), label: c.details })).join("")}</ul>` : "") +
    (rest.length ? `<h4 ${H}>${esc(c.alsoTomorrow)}</h4><ul ${ul}>${rest.map((e) => eventLi(e, ctx, { href: rsvpLink(e), label: c.rsvp })).join("")}</ul>` : "") +
    (share.length ? `<h4 ${H}>${esc(c.shareHarvest)}</h4><ul ${ul}>${share.map((e) => eventLi({ ...e, going: false }, ctx, { href: eventUrl(ctx.base, e), label: c.share })).join("")}</ul>` : "") +
    (count > 0 ? `<h4 ${H}>${esc(c.newHarvests)}</h4><p ${P}><a href="${esc(todayUrl)}" ${A}>${esc(c.harvestsToday(count))}</a></p>` : "") +
    (events.length ? `<p ${P}><a href="${esc(`${ctx.base}/tomorrow`)}" ${A}>${esc(c.openTomorrow)}</a></p>` : "");
  const text = [
    c.readyMail(dateLabel(input.date, ctx.lang, true)), "",
    ...(practice ? [c.tomorrowPractice, practice.title, practice.body, ""] : []),
    ...(mine.length ? [c.youreGoing, ...mine.map((e) => eventText(e, ctx.lang, eventUrl(ctx.base, e))), ""] : []),
    ...(rest.length ? [c.alsoTomorrow, ...rest.map((e) => `${eventText(e, ctx.lang, rsvpLink(e)).replace(/\n/, `\n${c.rsvp}: `)}`), ""] : []),
    ...(share.length ? [c.shareHarvest, ...share.map((e) => eventText({ ...e, going: false }, ctx.lang, eventUrl(ctx.base, e)).replace(/\n/, `\n${c.share}: `)), ""] : []),
    ...(count > 0 ? [c.newHarvests, `${c.harvestsToday(count)}: ${todayUrl}`, ""] : []),
    ...(events.length ? [`${c.openTomorrow}: ${ctx.base}/tomorrow`] : []),
  ].join("\n").trimEnd();
  return frame("evening", ctx, c.readyTitle, html, text, c.subjectDigest(dateLabel(input.date, ctx.lang, true)));
}

// ----------------------------------------------------------------- harvest

export interface HarvestInput {
  event: { did: string; rkey: string; name: string; where: string | null };
  lang: Lang;
}

const harvestUrl = (base: string, e: HarvestInput["event"]) => `${base}/events/${encodeURIComponent(e.did)}/${encodeURIComponent(e.rkey)}`;

export function harvestPush(input: HarvestInput, deviceId?: string): PushPayload {
  const c = T[input.lang];
  const name = shortName(input.event.name);
  return {
    title: clip(c.harvestTitle(name), 200),
    body: [c.harvestBody, c.harvestLine].filter(Boolean).join("\n\n"),
    url: `/events/${encodeURIComponent(input.event.did)}/${encodeURIComponent(input.event.rkey)}`, tag: `harvest-${input.event.rkey}`,
    ...(deviceId ? { device: deviceId } : {}),
    actions: [{ action: "open", title: c.share }, { action: "settings", title: c.settings }],
  };
}

export function harvestEmail(input: HarvestInput, ctx: MailContext): MailMessage {
  const c = T[ctx.lang];
  const name = shortName(input.event.name);
  const link = harvestUrl(ctx.base, input.event);
  const html =
    `<p ${P}>${c.harvestMail(esc(input.event.name), input.event.where ? esc(input.event.where) : null)}</p>` +
    `<p ${P}>${esc(c.harvestAsk)}</p><p ${P}><a href="${esc(link)}" ${A}>${esc(c.harvestLink)}</a></p><p ${P}>${esc(c.harvestVis)}</p>`;
  const text = [`${c.harvestMail(input.event.name, input.event.where).replace(/<\/?b>/g, "")}`, "", c.harvestAsk, `${c.harvestLink}: ${link}`, "", c.harvestVis].join("\n");
  return frame("harvest", ctx, c.harvestTitle(name), html, text, c.subjectHarvest(name));
}

// ------------------------------------------------------------ account mail

export function verifyEmail(lang: Lang, link: string): MailMessage {
  const c = T[lang];
  return {
    subject: c.verifySubject,
    html: mailShell(esc(c.verifyHeading), `<p ${P}>${esc(c.verifyBody)}</p><p ${P}><a href="${esc(link)}" ${A}>${esc(c.verifyLink)}</a></p>`, esc(c.verifyFoot)),
    text: `${c.verifyBody}\n\n${link}\n\n${c.verifyFoot}`,
  };
}

/** The one-tap ask added to the RSVP confirmation. */
export function optinBlock(lang: Lang, link: string): { html: string; text: string } {
  const c = T[lang];
  return {
    html: `<p ${P}><b>${esc(c.optinLead)}</b><br><a href="${esc(link)}" ${A}>${esc(c.optinLink)}</a></p>`,
    text: `${c.optinLead}\n${c.optinLink}: ${link}`,
  };
}

export function testPush(lang: Lang, deviceId: string): PushPayload {
  const c = T[lang];
  return { title: c.testTitle, body: c.testBody, url: "/more/notifications", tag: "notify-test", device: deviceId };
}
