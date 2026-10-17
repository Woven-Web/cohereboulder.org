import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useShell } from "@/components/almanac/shell-context";
import { fill } from "@/components/almanac/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { openSignInDialog } from "@/lib/signin";
import { formatDay } from "@/lib/festival";
import { enableReminders, reminderSupport, useReminders } from "@/lib/reminders";
import { useCompanionToday } from "@/lib/useCompanionToday";
import { useInstallOffer } from "@/lib/useInstallOffer";
import {
  NOTIFY_SETTINGS_KEY, NOTIFY_TYPES, NotifyError, addEmail, addEmailPatch, fetchLink, fetchSettings, linkAction, offerEmailToo, saveSettings, syncDevice, testPush, thisDeviceId,
  type Channel, type NotifyType, type SettingsPatch, type SettingsView,
} from "@/lib/notify";

const EMAIL_OK = /^\S+@\S+\.\S+$/;

/** "Sat Oct 17, 8:02 PM" in Boulder time, in the reader's language. */
function when(iso: string, language: "en" | "es"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { timeZone: "America/Denver", hour: "numeric", minute: "2-digit" }).format(d);
  return `${formatDay(day, language)}, ${time}`;
}

/**
 * The settings screen: how we reach you, then four notes, each a switch and a
 * Phone | Email choice. Signed in (the account's own settings) or from an
 * emailed link (`token`: that address's settings, no sign-in, no push).
 */
export function NotificationSettings({ token }: { token?: string }) {
  const { tr } = useLanguage();
  const queryClient = useQueryClient();
  const guest = Boolean(token);
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session, isLoading: sessionLoading } = useRegenosSession(laneOn);
  const did = laneOn ? session?.did ?? null : null;
  const key = guest ? ["notify-link", token] : [...NOTIFY_SETTINGS_KEY, did];

  const query = useQuery<SettingsView>({
    queryKey: key,
    queryFn: async () => (guest ? ((await fetchLink(token as string)).view as SettingsView) : fetchSettings(thisDeviceId())),
    enabled: guest || Boolean(did),
    staleTime: 10_000,
    retry: 1,
  });
  const view = query.data;

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => (guest ? linkAction<SettingsView>(token as string, "settings", patch, "PUT") : saveSettings(patch, thisDeviceId())),
    onSuccess: (next) => queryClient.setQueryData(key, next),
  });

  if (!guest && (sessionLoading || (config === undefined))) return <p className="small" role="status" style={{ padding: "3rem 0" }}>{tr("notify.loading")}</p>;
  if (!guest && !did) return <SignedOut />;
  if (query.isLoading) return <p className="small" role="status" style={{ padding: "3rem 0" }}>{tr("notify.loading")}</p>;
  if (query.isError || !view) {
    return (
      <div className="gate" data-testid="notify-error">
        <p className="lede">{tr("notify.loadError")}</p>
        <button type="button" className="btn btn--line btn--sm" onClick={() => void query.refetch()}>{tr("notify.retry")}</button>
      </div>
    );
  }

  return (
    <>
      {guest && (
        <div style={{ marginTop: ".6rem" }} data-testid="notify-guest">
          <h2 className="h3">{fill(tr("notify.guest.title"), { email: view.email.address ?? "" })}</h2>
          <p className="small" style={{ marginTop: ".3rem" }}>{tr("notify.guest.body")}</p>
        </div>
      )}
      <Reach view={view} guest={guest} />
      {!guest && offerEmailToo(view) && <EmailToo view={view} busy={save.isPending} onAdd={(patch) => save.mutate(patch)} />}
      <div style={{ marginTop: "var(--sp-5)" }}>
        {NOTIFY_TYPES.filter((type) => view.notes[type]).map((type) => (
          <NoteRow key={type} type={type} view={view} guest={guest} busy={save.isPending} onChange={(patch) => save.mutate(patch)} />
        ))}
        <div style={{ borderTop: "var(--rule-w) solid var(--rule)" }} />
      </div>
      <p className="note">
        {tr("notify.footnote")} {!guest && view.push.status === "live" && <TestPush />}
      </p>
      {save.isError && <p className="small" role="alert" style={{ color: "var(--berry)" }}>{tr("notify.saveFailed")}</p>}
    </>
  );
}

/** The phone took over the notes by default. One quiet line, one tap to keep email as well. */
function EmailToo({ view, busy, onAdd }: { view: SettingsView; busy: boolean; onAdd: (patch: SettingsPatch) => void }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  return (
    <p className="small" style={{ marginTop: "var(--sp-3)" }} data-testid="notify-email-too">
      {tr("notify.emailToo.line")}{" "}
      <button type="button" className="link" style={{ minHeight: 0 }} disabled={busy} onClick={() => { onAdd(addEmailPatch(view)); toast(tr("notify.emailToo.added")); }}>
        {tr("notify.emailToo.add")}
      </button>
    </p>
  );
}

function SignedOut() {
  const { tr } = useLanguage();
  return (
    <div className="gate" data-testid="notify-signed-out">
      <h2 className="h3">{tr("notify.signedOut.title")}</h2>
      <p className="lede">{tr("notify.signedOut.body")}</p>
      <div className="gate__acts">
        <button type="button" className="btn btn--primary" onClick={openSignInDialog}>{tr("notify.signedOut.signIn")}</button>
        <Link className="btn btn--line" to="/more">{tr("notify.more")}</Link>
      </div>
    </div>
  );
}

function TestPush() {
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  return (
    <button type="button" className="link" style={{ minHeight: 0 }} onClick={() => void testPush(language).then((ok) => toast(tr(ok === "paused" ? "notify.testPaused" : ok ? "notify.testSent" : "notify.testFailed")))}>
      {tr("notify.testPush")}
    </button>
  );
}

// ---------------------------------------------------------------- reach

function Reach({ view, guest }: { view: SettingsView; guest: boolean }) {
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  const queryClient = useQueryClient();
  const reminders = useReminders();
  const { installed } = useInstallOffer();
  const { data: today } = useCompanionToday();
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);

  const device = view.push.thisDevice;
  const supported = reminderSupport(today?.pushKey) || (typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window);
  const nothing = view.nothingReaches;
  const broke = !guest && (view.pushBroke || device?.status === "suspect" || device?.status === "expired") && installed;

  async function repair() {
    if (!today?.pushKey) return;
    setBusy(true);
    try {
      // A tap is needed to ask the browser again; if it is already granted and subscribed, this just re-reports.
      if (!reminders.subscribed || reminders.permission !== "granted") await enableReminders(today.pushKey, language);
      await syncDevice({ signedIn: true, language, pushKey: today.pushKey, force: true });
      const ok = await testPush(language);
      await queryClient.invalidateQueries({ queryKey: NOTIFY_SETTINGS_KEY });
      toast(tr(ok === "paused" ? "notify.testPaused" : ok ? "notify.reach.back" : "notify.reach.backFailed"));
    } finally {
      setBusy(false);
    }
  }

  let push: JSX.Element;
  if (guest) {
    const live = view.push.status === "live";
    push = (
      <div className="reach__line">
        <span className="dot" data-on={live ? "ok" : "warn"} />
        <div>
          <b>{tr(live ? "notify.reach.liveOther" : "notify.reach.notInstalled")}</b>
          <span className="s">{tr("notify.reach.guestNote")}</span>
        </div>
      </div>
    );
  } else if (!installed && device?.status !== "live") {
    // Installing comes first: a browser tab that isn't the app has nothing to turn on yet.
    push = (
      <Line tone="warn" title={tr("notify.reach.notInstalled")}>
        {tr("notify.reach.installHint")} <Link className="link" style={{ minHeight: 0 }} to="/more">{tr("notify.reach.howInstall")}</Link>
      </Line>
    );
  } else if (reminders.permission === "denied") {
    push = <Line tone="bad" title={tr("notify.reach.denied")} />;
  } else if (broke) {
    push = (
      <>
        <Line tone="bad" title={tr("notify.reach.broke")}>
          <span className="mono" style={{ fontSize: ".72rem" }}>
            {[view.push.lastDeliveredAt ? fill(tr("notify.reach.lastDelivered"), { when: when(view.push.lastDeliveredAt, language) }) : "", view.push.failedSince ? fill(tr("notify.reach.brokeDetail"), { n: view.push.failedSince }) : ""].filter(Boolean).join(" · ")}
          </span>
        </Line>
        <button type="button" className="btn btn--primary" disabled={busy || !supported} onClick={() => void repair()} data-testid="turn-push-back-on">{tr("notify.reach.turnBack")}</button>
      </>
    );
  } else if (supported && (!reminders.subscribed || reminders.permission !== "granted")) {
    push = (
      <>
        <Line tone="warn" title={tr("notify.reach.appOff")} />
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void repair()}>{tr("notify.reach.turnOn")}</button>
      </>
    );
  } else {
    push = (
      <Line tone="ok" title={tr("notify.reach.live")}>
        {view.push.lastDeliveredAt && <span className="mono" style={{ fontSize: ".72rem" }}>{fill(tr("notify.reach.lastDelivered"), { when: when(view.push.lastDeliveredAt, language) })}</span>}
      </Line>
    );
  }

  return (
    <section className={`reach${broke || nothing ? " reach--bad" : ""}`} aria-label={tr("notify.reach.title")} data-testid="notify-reach">
      <h2>{nothing ? tr("notify.reach.nothing") : tr("notify.reach.title")}</h2>
      {push}
      {view.email.address ? (
        <>
          <Line tone="ok" title={`${tr("notify.reach.email")} ${view.email.address}`}>
            {tr("notify.reach.emailUsed")}{" "}
            {!guest && <button type="button" className="link" style={{ minHeight: 0 }} onClick={() => setChanging((v) => !v)} aria-expanded={changing}>{tr("notify.reach.change")}</button>}
          </Line>
          {changing && !guest && <AddEmail onDone={() => setChanging(false)} />}
        </>
      ) : (
        <>
          <Line tone="bad" title={tr("notify.reach.noEmail")}>{tr("notify.reach.noEmailBody")}</Line>
          {!guest && <AddEmail />}
        </>
      )}
    </section>
  );
}

function Line({ tone, title, children }: { tone: "ok" | "bad" | "warn"; title: string; children?: React.ReactNode }) {
  return (
    <div className="reach__line">
      <span className="dot" data-on={tone} />
      <div>
        <b>{title}</b>
        {children && <span className="s">{children}</span>}
      </div>
    </div>
  );
}

function AddEmail({ onDone }: { onDone?: () => void }) {
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const send = useMutation({
    mutationFn: () => addEmail(value.trim(), language),
    onSuccess: (res) => {
      toast(tr(res.delivered ? "notify.reach.sent" : "notify.reach.notDelivered"));
      setValue("");
      onDone?.();
    },
    onError: (error) => toast(tr(error instanceof NotifyError && error.status === 429 ? "notify.reach.tooMany" : "notify.reach.sendFailed")),
  });
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!EMAIL_OK.test(value.trim())) { setBad(true); return; }
    send.mutate();
  }
  return (
    <form className="addmail" id="addmail" onSubmit={submit} noValidate>
      <ol>
        <li>{tr("notify.reach.step1")}</li>
        <li>{tr("notify.reach.step2")}</li>
      </ol>
      <div className={`field${bad ? " has-error" : ""}`} id="em-f">
        <label className="field__label" htmlFor="em-t">{tr("notify.reach.emailLabel")}</label>
        <input className="field__input" id="em-t" type="email" inputMode="email" autoComplete="email" placeholder="you@example.org" value={value} aria-invalid={bad}
          onChange={(e) => { setValue(e.target.value); setBad(false); }} />
        <span className="field__error" role={bad ? "alert" : undefined}>{tr("notify.reach.emailError")}</span>
      </div>
      <button type="submit" className="btn btn--line" style={{ justifySelf: "start" }} disabled={send.isPending}>
        {tr(send.isPending ? "notify.reach.sending" : "notify.reach.send")}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------- one note

function NoteRow({ type, view, guest, busy, onChange }: { type: NotifyType; view: SettingsView; guest: boolean; busy: boolean; onChange: (patch: SettingsPatch) => void }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const note = view.notes[type];
  const hasEmail = Boolean(view.email.address);
  const labelId = `n-${type}`;
  const pushOK = note.pushAvailable && !guest;
  const selected: Channel = note.channel;
  const toggle = (which: "phone" | "email") => onChange({ [type]: { channels: { phone: note.phone, email: note.email, [which]: !note[which] } } });

  // Event reminders never fall back to email on their own: say so instead of "using email".
  const reminderNoPush = type === "reminder" && !pushOK && !note.email;
  const why = reminderNoPush ? { text: tr(guest ? "notify.why.reminderGuest" : "notify.why.reminderNeedsApp"), warn: false }
    : note.on && selected === "email" && !hasEmail ? { text: tr("notify.why.noEmail"), warn: true }
    : note.on && view.email.registered && !note.chosen && !pushOK && note.email ? { text: tr("notify.why.registered"), warn: false }
    : !pushOK ? { text: view.pushBroke ? tr("notify.why.pushBroke") : guest ? tr("notify.why.guestNeedsApp") : tr("notify.why.needsApp"), warn: false }
    : { text: note.chosen ? tr("notify.why.chose") : tr("notify.why.byDefault"), warn: false };

  return (
    <div className={`nset${note.on ? "" : " is-off"}`} data-testid={`note-${type}`} data-on={note.on} data-channel={selected}>
      <div className="vis">
        <div>
          <b id={labelId}>{tr(`notify.notes.${type}.name`)}</b>
          <p>{tr(`notify.notes.${type}.about`)}</p>
          <span className="nset__t">{tr(`notify.notes.${type}.when`)}</span>
        </div>
        <button
          type="button" role="switch" aria-checked={note.on} aria-labelledby={labelId} className={`switch${note.on ? " is-on" : ""}`} disabled={busy}
          onClick={() => { onChange({ [type]: { on: !note.on } }); toast(tr(note.on ? "notify.off" : "notify.on")); }}
        />
      </div>
      <div className="nset__ch">
        <p className="small" id={`${labelId}-c`}>{tr("notify.sendBy")}</p>
        <div className="seg" role="group" aria-labelledby={`${labelId}-c`}>
          <button type="button" aria-pressed={note.phone} data-testid={`${type}-phone`} disabled={!pushOK || busy} onClick={() => toggle("phone")}>{tr("notify.phone")}</button>
          <button type="button" aria-pressed={note.email} data-testid={`${type}-email`} disabled={busy} onClick={() => toggle("email")}>{tr("notify.email")}</button>
        </div>
        <p className={`nset__why${why.warn ? "" : " m"}`}>{why.text}</p>
      </div>
    </div>
  );
}
