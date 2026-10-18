import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { fill } from "@/components/almanac/format";
import { EmailLinkSettings } from "@/components/notify/EmailLinkSettings";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchLink, linkAction, type LinkInfo, type NotifyType } from "@/lib/notify";
import { formatEventDate } from "@/lib/events";

/**
 * Where a link in one of our emails lands, with no sign-in: the token says who
 * and what. Anything that changes something is a button (a POST), never the
 * page load itself, so a mail scanner opening the link changes nothing.
 */
export default function NotifyLink() {
  const { token = "" } = useParams();
  const { tr } = useLanguage();
  const info = useQuery({ queryKey: ["notify-link", token, "info"], queryFn: () => fetchLink(token), retry: false, staleTime: Infinity });

  return (
    <AlmanacShell>
      <main className="page" style={{ paddingTop: 0 }}>
        {info.isLoading ? (
          <p className="small" role="status" style={{ padding: "3rem 0" }}>{tr("notify.loading")}</p>
        ) : info.isError || !info.data ? (
          <div className="gate" style={{ marginTop: "1.6rem" }} data-testid="link-invalid">
            <h1 className="h2">{tr("notify.link.invalidTitle")}</h1>
            <p className="lede">{tr("notify.link.invalidBody")}</p>
            <div className="gate__acts"><Link className="btn btn--line" to="/more/notifications">{tr("notify.title")}</Link></div>
          </div>
        ) : info.data.kind === "settings" && info.data.view ? (
          <>
            <Link className="link" to="/" style={{ marginTop: ".4rem" }}>← {tr("notify.link.home")}</Link>
            <h1 className="h1" style={{ margin: ".5rem 0 .2rem" }}>{tr("notify.title")}</h1>
            <EmailLinkSettings token={token} initial={info.data.view} />
          </>
        ) : (
          <Action token={token} info={info.data} />
        )}
      </main>
    </AlmanacShell>
  );
}

function Action({ token, info }: { token: string; info: LinkInfo }) {
  const { tr, language } = useLanguage();
  const [done, setDone] = useState(false);
  const [undone, setUndone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState<Record<string, number | null>>({});
  const email = info.email ?? "";
  const all = info.type === "all" || info.type === null;
  const note = all ? tr("notify.link.unsubAll") : tr(`notify.notes.${info.type as NotifyType}.name`).toLowerCase();

  const name = info.event?.name ?? "";

  async function run(action: string, body: unknown = {}) {
    setBusy(true); setFailed(false);
    try {
      const res = await linkAction<{ ok: true; previous?: Record<string, number | null> }>(token, action, body);
      if (action === "unsubscribe") setPrevious(res.previous ?? {});
      return true;
    } catch {
      setFailed(true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  let title: string, body: string, button: string, action: string;
  if (info.kind === "unsub") {
    title = done && !undone ? tr(all ? "notify.link.unsubDoneAll" : "notify.link.unsubDone").replace("{name}", note) : fill(tr("notify.link.unsubTitle"), { name: note });
    body = fill(tr(all ? "notify.link.unsubBodyAll" : "notify.link.unsubBody"), { email });
    button = tr("notify.link.unsubButton"); action = "unsubscribe";
  } else if (info.kind === "optin") {
    title = fill(tr("notify.link.optinTitle"), { email }); body = tr("notify.link.optinBody"); button = tr("notify.link.optinButton"); action = "optin";
    if (done) { title = fill(tr("notify.link.optinDone"), { email }); body = ""; }
  } else if (info.kind === "verify") {
    title = fill(tr("notify.link.verifyTitle"), { email }); body = ""; button = tr("notify.link.verifyButton"); action = "verify";
    if (done) title = fill(tr("notify.link.verifyDone"), { email });
  } else {
    // rsvp
    const when = info.event?.startsAt ? formatEventDate(info.event.startsAt, language) : null;
    title = info.event === null ? tr("notify.link.rsvpGone") : fill(tr("notify.link.rsvpTitle"), { name });
    body = info.event ? [when, info.event.where].filter(Boolean).join(" · ") + (when || info.event.where ? ". " : "") + fill(tr("notify.link.rsvpBody"), { email }) : "";
    button = tr("notify.link.rsvpButton"); action = "rsvp";
    if (done) { title = tr("notify.link.rsvpDone"); body = ""; }
  }

  return (
    <div className="gate" style={{ marginTop: "1.6rem" }} data-testid={`link-${info.kind}`} data-done={done && !undone}>
      <div className="folio">{tr("notify.link.folio")}</div>
      <h1 className="h2" data-testid="link-title">{title}</h1>
      {body && <p className="lede">{body}</p>}
      {undone && <p className="lede" role="status">{tr("notify.link.undone")}</p>}
      {failed && <p className="small" role="alert" style={{ color: "var(--berry)" }}>{tr("notify.link.failed")}</p>}
      <div className="gate__acts">
        {info.kind === "rsvp" && info.event === null ? null : !done ? (
          <button type="button" className="btn btn--primary" disabled={busy} data-testid="link-confirm" onClick={() => void run(action).then((ok) => ok && setDone(true))}>{button}</button>
        ) : info.kind === "unsub" && !undone ? (
          <button type="button" className="btn btn--line" disabled={busy} data-testid="link-undo" onClick={() => void run("resubscribe", { previous }).then((ok) => ok && setUndone(true))}>{tr("notify.link.undo")}</button>
        ) : null}
        {done && info.kind !== "unsub" && <Link className="btn btn--line" to="/today">{tr("notify.link.home")}</Link>}
      </div>
    </div>
  );
}
