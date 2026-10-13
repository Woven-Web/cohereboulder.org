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
    readyTitle: "Ready for tomorrow?", readyBody: (n: number, d: string, m: number) => `${n} event${n === 1 ? "" : "s"} on ${d}. You’re going to ${m}.`,
    readyMail: (d: string) => `Tomorrow is ${d}. One tap on “RSVP” saves your place. No sign-in needed.`, openTomorrow: "Open tomorrow in COhere",
    harvestTitle: (n: string) => `How was ${n}?`, harvestBody: "Share your harvest.", harvestLine: "A few words, or a photo, for everyone in COhere.",
    harvestMail: (e: string, w: string | null) => `You said you were going to <b>${e}</b>${w ? ` at ${w}` : ""}.`,
    harvestAsk: "How was it? A few words, or a photo, about what you took with you.", harvestLink: "Share your harvest",
    harvestVis: "Harvests are visible to everyone in COhere and carry your name.",
    names: { morning: "Morning note", harvest: "Harvest invitation", evening: "Ready for tomorrow" } as Record<NotifyType, string>,
    because: (name: string, to: string) => `You get this because the “${name}” is on for ${to}.`,
    change: "Change which notes you get", unsub: (name: string) => `Unsubscribe from the ${name.toLowerCase()}`,
    fellBack: "Push stopped working, so we sent this by email.", fellBackLink: "Turn push back on",
    subjectMorning: (n: number, t: string) => `Day ${n}: ${t}`, subjectEvening: (n: number, d: string) => `Ready for tomorrow: ${n} event${n === 1 ? "" : "s"} on ${d}`,
    subjectHarvest: (n: string) => `How was ${n}? Share your harvest`,
    testTitle: "Push is working", testBody: "This is a test from COhere. You can close it.",
    verifySubject: "Confirm your email for COhere notifications", verifyHeading: "Is this your email?", verifyBody: "Tap once to use this address for COhere notifications.",
    verifyLink: "Yes, use this address", verifyFoot: "If you didn’t ask for this, ignore it. Nothing changes until you tap the link.",
    optinLead: "Want a note the evening before and after the events you RSVP to?", optinBody: "At 8 PM we can list tomorrow’s events, and about an hour after an event ends we can ask how it was. Email only, and one tap to stop.",
    optinLink: "Yes, send me those notes",
  },
  es: {
    day: "Día", thenAsk: "Luego pregúntate:", settings: "Ajustes", openToday: "Abrir Hoy", rsvpTomorrow: "RSVP para mañana", share: "Compartir cosecha",
    going: "voy", more: (n: number) => `+ ${n} evento${n === 1 ? "" : "s"} más hoy`, moreTomorrow: (n: number) => `+ ${n} más`,
    youreGoing: "Vas a", eventsToday: "Los eventos de hoy", also: "También", alsoToday: "También hoy", alsoTomorrow: "También mañana", yourEvents: "Tus eventos de hoy",
    practice: "La práctica de hoy", dayOf: (n: number, d: string) => `Día ${n} de 11 · ${d}`, openTodayLink: "Abrir Hoy en COhere",
    details: "Detalles", imGoing: "Voy", rsvp: "RSVP: voy",
    readyTitle: "¿Lista para mañana?", readyBody: (n: number, d: string, m: number) => `${n} evento${n === 1 ? "" : "s"} el ${d}. Vas a ${m}.`,
    readyMail: (d: string) => `Mañana es ${d}. Un toque en “RSVP” guarda tu lugar. No hace falta iniciar sesión.`, openTomorrow: "Abrir mañana en COhere",
    harvestTitle: (n: string) => `¿Cómo estuvo ${n}?`, harvestBody: "Comparte tu cosecha.", harvestLine: "Unas palabras, o una foto, para todas las personas de COhere.",
    harvestMail: (e: string, w: string | null) => `Dijiste que ibas a <b>${e}</b>${w ? ` en ${w}` : ""}.`,
    harvestAsk: "¿Cómo estuvo? Unas palabras, o una foto, sobre lo que te llevaste.", harvestLink: "Comparte tu cosecha",
    harvestVis: "Las cosechas son visibles para todas las personas de COhere y llevan tu nombre.",
    names: { morning: "Nota de la mañana", harvest: "Invitación a la cosecha", evening: "Lista para mañana" } as Record<NotifyType, string>,
    because: (name: string, to: string) => `Recibes esto porque “${name}” está activada para ${to}.`,
    change: "Cambia qué avisos recibes", unsub: (name: string) => `Darte de baja de: ${name.toLowerCase()}`,
    fellBack: "El aviso push dejó de funcionar, así que te lo enviamos por correo.", fellBackLink: "Reactivar los avisos push",
    subjectMorning: (n: number, t: string) => `Día ${n}: ${t}`, subjectEvening: (n: number, d: string) => `Lista para mañana: ${n} evento${n === 1 ? "" : "s"} el ${d}`,
    subjectHarvest: (n: string) => `¿Cómo estuvo ${n}? Comparte tu cosecha`,
    testTitle: "El push funciona", testBody: "Esto es una prueba de COhere. Puedes cerrarlo.",
    verifySubject: "Confirma tu correo para los avisos de COhere", verifyHeading: "¿Es este tu correo?", verifyBody: "Toca una vez para usar esta dirección en los avisos de COhere.",
    verifyLink: "Sí, usar esta dirección", verifyFoot: "Si no lo pediste, ignóralo. Nada cambia hasta que toques el enlace.",
    optinLead: "¿Quieres un aviso la noche antes y después de los eventos a los que confirmas?", optinBody: "A las 8 PM podemos listar los eventos de mañana, y una hora después de que termine un evento preguntarte cómo estuvo. Solo por correo, y un toque para dejar de recibirlos.",
    optinLink: "Sí, envíenme esos avisos",
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
  const footer = `${esc(c.because(name, ctx.to))}<br><a href="${esc(ctx.settingsUrl)}" ${A}>${esc(c.change)}</a> · <a href="${esc(ctx.unsubUrl)}" ${A}>${esc(c.unsub(name))}</a>`;
  return {
    subject,
    html: mailShell(esc(heading), top + bodyHtml, footer),
    text: `${topText}${bodyText}\n\n${c.because(name, ctx.to)}\n${c.change}: ${ctx.settingsUrl}\n${c.unsub(name)}: ${ctx.unsubUrl}`,
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
  const html =
    `<p ${P}>${esc(c.readyMail(dateLabel(input.date, ctx.lang, true)))}</p>` +
    (mine.length ? `<h4 ${H}>${esc(c.youreGoing)}</h4><ul style="margin:0 0 12px;padding:0;list-style:none">${mine.map((e) => eventLi(e, ctx, { href: eventUrl(ctx.base, e), label: c.details })).join("")}</ul>` : "") +
    (rest.length ? `<h4 ${H}>${esc(c.alsoTomorrow)}</h4><ul style="margin:0 0 12px;padding:0;list-style:none">${rest.map((e) => eventLi(e, ctx, { href: rsvpLink(e), label: c.rsvp })).join("")}</ul>` : "") +
    `<p ${P}><a href="${esc(`${ctx.base}/tomorrow`)}" ${A}>${esc(c.openTomorrow)}</a></p>`;
  const text = [
    c.readyMail(dateLabel(input.date, ctx.lang, true)), "",
    ...(mine.length ? [c.youreGoing, ...mine.map((e) => eventText(e, ctx.lang, eventUrl(ctx.base, e))), ""] : []),
    ...(rest.length ? [c.alsoTomorrow, ...rest.map((e) => `${eventText(e, ctx.lang, rsvpLink(e)).replace(/\n/, `\n${c.rsvp}: `)}`), ""] : []),
    `${c.openTomorrow}: ${ctx.base}/tomorrow`,
  ].join("\n");
  return frame("evening", ctx, c.readyTitle, html, text, c.subjectEvening(events.length, dateLabel(input.date, ctx.lang)));
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
    body: `${c.harvestBody}\n\n${c.harvestLine}`,
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
    html: `<p ${P}><b>${esc(c.optinLead)}</b><br>${esc(c.optinBody)}<br><a href="${esc(link)}" ${A}>${esc(c.optinLink)}</a></p>`,
    text: `${c.optinLead}\n${c.optinBody}\n${c.optinLink}: ${link}`,
  };
}

export function testPush(lang: Lang, deviceId: string): PushPayload {
  const c = T[lang];
  return { title: c.testTitle, body: c.testBody, url: "/more/notifications", tag: "notify-test", device: deviceId };
}
