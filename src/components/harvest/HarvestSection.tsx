import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/almanac/BottomSheet";
import { fill } from "@/components/almanac/format";
import { useShell } from "@/components/almanac/shell-context";
import { Avatar } from "@/components/members/Avatar";
import { ReportSheet } from "@/components/members/BoardSheets";
import { useCircleAccess } from "@/hooks/useCircleAccess";
import { useLanguage } from "@/contexts/LanguageContext";
import { currentDenverDate } from "@/lib/companion";
import type { CommunityEvent } from "@/lib/events";
import { dayNumber, formatDay } from "@/lib/festival";
import { eventKey } from "@/lib/myEvents";
import { shortName } from "@/components/harvest/names";
import { fetchMySeat, XrpcError } from "@/lib/regenos";
import { useCompanionToday } from "@/lib/useCompanionToday";
import { openSignInDialog } from "@/lib/signin";
import {
  HARVESTS_KEY, HARVEST_TEXT_MAX, eventEndedAt, MY_HARVESTS_KEY, createHarvest, deleteHarvest, editHarvest, fetchHarvests, harvestUri, photoUrl, shrinkPhoto,
  type Harvest,
} from "@/lib/harvest";

function stamp(iso: string, language: "en" | "es"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }).format(d);
  return `${formatDay(day, language)} · ${time}`;
}

/**
 * Harvest, at the foot of an event's page. Before the event ends it says when it
 * opens. After, it is for COhere members: they read what others took from it
 * and write their own (an hour after the event, an RSVP'd member gets a nudge).
 */
export function HarvestSection({ event }: { event: CommunityEvent }) {
  const { tr } = useLanguage();
  const access = useCircleAccess();
  const ended = eventEndedAt(event);
  if (event.status === "cancelled" || ended === null) return null;

  const head = (
    <>
      <div className="eyebrow" style={{ marginTop: "2rem" }}>{tr("notify.harvest.eyebrow")}</div>
      <p className="small" style={{ marginTop: ".4rem", maxWidth: "30rem" }}>{tr("notify.harvest.lede")}</p>
    </>
  );

  if (ended > Date.now()) {
    return (
      <section className="hv" data-testid="harvest-section" data-state="not-yet">
        {head}
        <p className="closed"><b>{tr("notify.harvest.notYet")}</b> {tr("notify.harvest.notYetBody")}</p>
      </section>
    );
  }
  if (access.status === "loading" || access.status === "off" || access.status === "error") return null;
  if (access.status !== "member") {
    const signedOut = access.status === "signed-out";
    return (
      <section className="hv" data-testid="harvest-section" data-state={access.status}>
        {head}
        <div className="closed">
          <b>{tr(signedOut ? "notify.harvest.gateSignedOut" : "notify.harvest.gateNotMember")}</b>{" "}
          {tr(signedOut ? "notify.harvest.gateSignedOutBody" : "notify.harvest.gateNotMemberBody")}
          <div style={{ marginTop: ".6rem" }}>
            {signedOut
              ? <button type="button" className="btn btn--line btn--sm" onClick={openSignInDialog}>{tr("notify.harvest.signIn")}</button>
              : <Link className="btn btn--line btn--sm" to="/register">{tr("notify.harvest.register")}</Link>}
          </div>
        </div>
      </section>
    );
  }
  return <MemberHarvests event={event} head={head} nameOf={access.nameOf} did={access.did ?? ""} />;
}

function MemberHarvests({ event, head, nameOf, did }: { event: CommunityEvent; head: JSX.Element; nameOf: (did: string) => string; did: string }) {
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  const queryClient = useQueryClient();
  const key = [...HARVESTS_KEY, event.did, event.rkey];
  const list = useQuery({ queryKey: key, queryFn: () => fetchHarvests(event.did, event.rkey), retry: 1, staleTime: 15_000 });
  const seat = useQuery({ queryKey: ["harvest-seat", did, eventKey(event)], queryFn: () => fetchMySeat(event.did, event.rkey), retry: 0, staleTime: 5 * 60_000 });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState<Harvest | null>(null);
  const [reporting, setReporting] = useState<Harvest | null>(null);

  // Arriving from the Today card or a push (#composer / #mine): bring that part into view once it exists.
  const loaded = !list.isLoading && !list.isError;
  useEffect(() => {
    if (!loaded || !["#composer", "#mine"].includes(window.location.hash)) return;
    const timer = window.setTimeout(() => (document.getElementById(window.location.hash.slice(1)) ?? document.getElementById("mine") ?? document.getElementById("composer"))?.scrollIntoView({ block: "center" }), 80);
    return () => window.clearTimeout(timer);
  }, [loaded]);

  const all = list.data ?? [];
  const mine = all.find((h) => h.mine) ?? null;
  const others = all.filter((h) => !h.mine);
  const went = seat.data?.seat === "confirmed";
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: HARVESTS_KEY });
    void queryClient.invalidateQueries({ queryKey: MY_HARVESTS_KEY });
  };

  return (
    <section className="hv" data-testid="harvest-section" data-state="open">
      {head}
      <div className="hv__head">
        <span />
        {all.length > 0 && <span className="hv__count" data-testid="harvest-count">{fill(tr("notify.harvest.count"), { n: all.length })}</span>}
      </div>
      {list.isError && <p className="small" role="status">{tr("notify.harvest.loadError")}</p>}
      {!list.isLoading && !list.isError && (
        <>
          {mine ? (
            <div className="hv-mine" id="mine">
              {editing ? (
                <Editor harvest={mine} onDone={() => { setEditing(false); refresh(); }} onCancel={() => setEditing(false)} />
              ) : (
                <MineCard harvest={mine} name={nameOf(did)} onEdit={() => setEditing(true)} onDelete={() => setDeleting(mine)} />
              )}
            </div>
          ) : (
            <>
              {!went && !seat.isLoading && <p className="small" style={{ marginTop: ".6rem" }} data-testid="harvest-didnt-rsvp">{tr("notify.harvest.didntRsvp")}</p>}
              <Composer event={event} onShared={() => { refresh(); toast(tr("notify.harvest.shared")); window.setTimeout(() => document.getElementById("mine")?.scrollIntoView({ block: "center" }), 150); }} />
            </>
          )}
          {others.length > 0 ? (
            <>
              <div className="eyebrow" style={{ marginTop: "2rem" }}>{tr("notify.harvest.others")}</div>
              <div className="hv-list">
                {others.map((h) => (
                  <article key={h.id} className="post" data-testid="harvest-post">
                    <div className="post__by">
                      <Avatar did={h.authorDid} name={nameOf(h.authorDid)} size="sm" />
                      <b>{nameOf(h.authorDid)}</b>
                      <time dateTime={h.createdAt}>{stamp(h.createdAt, language)}</time>
                    </div>
                    <p className="post__text" {...(h.lang !== language ? { lang: h.lang } : {})}>{h.body}{h.editedAt && <span className="edited">{tr("notify.harvest.edited")}</span>}</p>
                    {h.hasPhoto && <figure className="ph ph--sm"><img src={photoUrl(h.id)} alt={tr("notify.harvest.photoAlt")} loading="lazy" /></figure>}
                    <div className="post__foot">
                      <span className="hash">{h.lang === "es" ? "Español" : ""}</span>
                      <button type="button" className="link" onClick={() => setReporting(h)}>{tr("notify.harvest.report")}</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            !mine && <p className="hv-empty" data-testid="harvest-empty">{tr("notify.harvest.empty")}</p>
          )}
        </>
      )}
      <DeleteHarvestSheet harvest={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); setEditing(false); refresh(); toast(tr("notify.harvest.deleted")); }} />
      <ReportSheet
        open={reporting !== null}
        onOpenChange={(open) => !open && setReporting(null)}
        target={reporting ? { uri: harvestUri(reporting.id), excerpt: Array.from(reporting.body).slice(0, 280).join("") } : null}
      />
    </section>
  );
}

// ------------------------------------------------------------------ writing

function Visible() {
  const { tr } = useLanguage();
  return <p className="visnote"><span><b>{tr("notify.harvest.visible")}</b> {tr("notify.harvest.visibleBody")}</span></p>;
}

/** The photo control shared by the composer and the editor. */
function PhotoField({ shown, onChange, onRemove }: { shown: string | null; onChange: (dataUrl: string) => void; onRemove: () => void }) {
  const { tr } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [bad, setBad] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setBad(false);
    try { onChange(await shrinkPhoto(file)); } catch { setBad(true); }
    if (input.current) input.current.value = "";
  }
  return (
    <div>
      {shown && <figure className="ph ph--compose"><img src={shown} alt={tr("notify.harvest.photoPreviewAlt")} /></figure>}
      <input ref={input} type="file" accept="image/*" hidden data-testid="harvest-photo-input" onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="compose__row" style={{ marginTop: shown ? ".6rem" : 0 }}>
        {shown
          ? <button type="button" className="btn btn--line btn--sm" onClick={onRemove}>{tr("notify.harvest.removePhoto")}</button>
          : <button type="button" className="btn btn--line btn--sm" onClick={() => input.current?.click()}>{tr("notify.harvest.addPhoto")}</button>}
      </div>
      {bad && <p className="field__error" style={{ display: "block", marginTop: ".4rem" }} role="alert">{tr("notify.harvest.photoBad")}</p>}
      {!shown && <p className="small" style={{ marginTop: ".4rem" }}>{tr("notify.harvest.photoNote")}</p>}
    </div>
  );
}

function Composer({ event, onShared }: { event: CommunityEvent; onShared: () => void }) {
  const { tr, language } = useLanguage();
  const { data: today } = useCompanionToday();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [which, setWhich] = useState<"event" | "inquiry">("event");
  const [missing, setMissing] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const question = language === "es" ? today?.daily?.question_es || today?.daily?.question : today?.daily?.question;
  const dayN = dayNumber(currentDenverDate());
  const prompts = [
    { id: "event" as const, kicker: tr("notify.harvest.kickerEvent"), text: fill(tr("notify.harvest.promptEvent"), { name: shortName(event.name) }) },
    ...(question && dayN >= 1 && dayN <= 11 ? [{ id: "inquiry" as const, kicker: fill(tr("notify.harvest.kickerInquiry"), { n: dayN }), text: question }] : []),
  ];
  const shownPrompt = prompts.find((p) => p.id === which) ?? prompts[0];

  const share = useMutation({
    mutationFn: () => createHarvest({ eventDid: event.did, eventRkey: event.rkey, body: text, prompt: shownPrompt.id, lang: language, photo }),
    onSuccess: () => { setText(""); setPhoto(null); onShared(); },
  });
  const error = share.error instanceof XrpcError ? (share.error.status === 409 && /Edit it/.test(share.error.message) ? tr("notify.harvest.already") : tr("notify.harvest.shareFailed")) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setMissing(true); textRef.current?.focus(); return; }
    share.mutate();
  }

  return (
    <form className="compose" id="composer" onSubmit={submit} data-testid="harvest-composer" noValidate>
      <div className="compose__prompt">
        <small>{shownPrompt.kicker}</small>
        <p>{shownPrompt.text}</p>
        {prompts.length > 1 && <button type="button" className="link" onClick={() => setWhich(which === "event" ? "inquiry" : "event")}>{tr("notify.harvest.another")}</button>}
      </div>
      <div className={`field${missing ? " has-error" : ""}`} id="hv-f">
        <label className="field__label" htmlFor="hv-t">{tr("notify.harvest.yours")}</label>
        <textarea ref={textRef} className="field__input" id="hv-t" rows={5} maxLength={HARVEST_TEXT_MAX} value={text} aria-invalid={missing}
          placeholder={tr("notify.harvest.placeholder")} onChange={(e) => { setText(e.target.value); setMissing(false); }} />
        <span className="field__error" role={missing ? "alert" : undefined}>{tr("notify.harvest.needText")}</span>
        <div className="counter" id="hv-c">{fill(tr("notify.harvest.counter"), { n: Array.from(text).length, max: HARVEST_TEXT_MAX })}</div>
      </div>
      <PhotoField shown={photo} onChange={setPhoto} onRemove={() => setPhoto(null)} />
      <Visible />
      {error && <p className="small" role="alert" style={{ color: "var(--berry)" }}>{error}</p>}
      <button type="submit" className="btn btn--primary btn--block" disabled={share.isPending} aria-busy={share.isPending} data-testid="harvest-share">
        {tr(share.isPending ? "notify.harvest.sharing" : "notify.harvest.share")}
      </button>
    </form>
  );
}

function MineCard({ harvest, name, onEdit, onDelete }: { harvest: Harvest; name: string; onEdit: () => void; onDelete: () => void }) {
  const { tr, language } = useLanguage();
  return (
    <article className="post post--own" data-testid="harvest-mine" id={`harvest-${harvest.id}`}>
      <div className="post__by">
        <Avatar did={harvest.authorDid} name={name} size="sm" />
        <b>{name}</b>
        <time dateTime={harvest.createdAt}>{stamp(harvest.createdAt, language)}</time>
      </div>
      {harvest.moderation && <p className="vis-note" data-testid="mod-mark"><span><b>{tr(harvest.moderation === "hidden" ? "notify.harvest.markHidden" : "notify.harvest.markRemoved")}</b></span></p>}
      <p className="post__text">{harvest.body}{harvest.editedAt && <span className="edited" data-testid="harvest-edited">{tr("notify.harvest.edited")}</span>}</p>
      {harvest.hasPhoto && <figure className="ph ph--sm"><img src={photoUrl(harvest.id)} alt={tr("notify.harvest.photoAlt")} /></figure>}
      <div className="post__foot">
        <span className="hash">{tr("notify.harvest.visible").replace(/\.$/, "")}</span>
        <button type="button" className="link" onClick={onEdit}>{tr("notify.harvest.edit")}</button>
        <button type="button" className="link" onClick={onDelete}>{tr("notify.harvest.delete")}</button>
      </div>
    </article>
  );
}

function Editor({ harvest, onDone, onCancel }: { harvest: Harvest; onDone: () => void; onCancel: () => void }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const [text, setText] = useState(harvest.body);
  // undefined = leave the photo alone; null = remove it; a data URL = replace it.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [empty, setEmpty] = useState(false);
  const save = useMutation({
    mutationFn: () => editHarvest(harvest.id, { body: text, ...(photo !== undefined ? { photo } : {}) }),
    onSuccess: () => { toast(tr("notify.harvest.saved")); onDone(); },
    onError: () => toast(tr("notify.harvest.saveFailed")),
  });
  const current = photo === undefined ? (harvest.hasPhoto ? photoUrl(harvest.id) : null) : photo;
  return (
    <form className="compose" id="composer" data-testid="harvest-editor" noValidate onSubmit={(e) => { e.preventDefault(); if (!text.trim()) { setEmpty(true); return; } save.mutate(); }}>
      <div className={`field${empty ? " has-error" : ""}`} id="hv-f">
        <label className="field__label" htmlFor="hv-t">{tr("notify.harvest.editTitle")}</label>
        <textarea className="field__input" id="hv-t" rows={5} maxLength={HARVEST_TEXT_MAX} value={text} aria-invalid={empty} autoFocus
          onChange={(e) => { setText(e.target.value); setEmpty(false); }} />
        <span className="field__error" role={empty ? "alert" : undefined}>{tr("notify.harvest.editEmpty")}</span>
        <div className="counter">{fill(tr("notify.harvest.counter"), { n: Array.from(text).length, max: HARVEST_TEXT_MAX })}</div>
      </div>
      <PhotoField shown={current} onChange={setPhoto} onRemove={() => setPhoto(null)} />
      <Visible />
      <div style={{ display: "flex", gap: ".5rem" }}>
        <button type="submit" className="btn btn--primary" style={{ flex: 1 }} disabled={save.isPending} data-testid="harvest-save">{tr("notify.harvest.save")}</button>
        <button type="button" className="btn btn--quiet" onClick={onCancel}>{tr("notify.harvest.cancel")}</button>
      </div>
    </form>
  );
}

function DeleteHarvestSheet({ harvest, onClose, onDeleted }: { harvest: Harvest | null; onClose: () => void; onDeleted: () => void }) {
  const { tr } = useLanguage();
  const { toast } = useShell();
  const remove = useMutation({
    mutationFn: (id: string) => deleteHarvest(id),
    onSuccess: onDeleted,
    onError: () => toast(tr("notify.harvest.deleteFailed")),
  });
  return (
    <BottomSheet open={harvest !== null} onOpenChange={(open) => !open && onClose()} title={tr("notify.harvest.deleteTitle")} description={tr("notify.harvest.deleteBody")}>
      <button type="button" className="btn btn--primary btn--block" disabled={!harvest || remove.isPending} data-testid="harvest-delete-yes" onClick={() => harvest && remove.mutate(harvest.id)}>{tr("notify.harvest.deleteYes")}</button>
      <button type="button" className="btn btn--quiet btn--block" onClick={onClose}>{tr("notify.harvest.deleteKeep")}</button>
    </BottomSheet>
  );
}
