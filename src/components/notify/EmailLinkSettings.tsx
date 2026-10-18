import { useState } from "react";
import { Link } from "react-router-dom";
import { fill } from "@/components/almanac/format";
import { useLanguage } from "@/contexts/LanguageContext";
import { linkAction, type SettingsPatch, type SettingsView } from "@/lib/notify";

/** The two notes that can go by email to someone with no account, in the order they arrive in a day. */
const EMAIL_NOTES = ["morning", "evening"] as const;

/**
 * The page behind "Change your settings" in our emails: no sign-in, the token
 * says whose. Just the two emails a registrant can choose (the 6 AM morning
 * note and the 8 PM note), each a button that saves with a POST, then the way
 * to everything else (phone, reminders, harvest), which needs an account.
 */
export function EmailLinkSettings({ token, initial }: { token: string; initial: SettingsView }) {
  const { tr } = useLanguage();
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(patch: SettingsPatch) {
    setBusy(true); setFailed(false);
    try {
      setView(await linkAction<SettingsView>(token, "settings", patch, "POST"));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="email-settings">
      <div className="folio" style={{ marginTop: ".6rem" }}>{tr("notify.link.folio")}</div>
      <h2 className="h3" style={{ marginTop: ".3rem" }}>{fill(tr("notify.guest.title"), { email: view.email.address ?? "" })}</h2>
      <div style={{ marginTop: "var(--sp-4)" }}>
        {EMAIL_NOTES.map((type) => {
          const note = view.notes[type];
          const labelId = `e-${type}`;
          const status = note.email ? tr("notify.on") : note.phone ? tr("notify.emailLink.phoneOnly") : tr("notify.off");
          return (
            <div key={type} className={`nset${note.email ? "" : " is-off"}`} data-testid={`email-${type}`} data-on={note.email}>
              <div className="vis">
                <div>
                  <b id={labelId}>{tr(`notify.notes.${type}.name`)}</b>
                  <p>{tr(`notify.notes.${type}.about`)}</p>
                  <span className="nset__t">{tr(`notify.notes.${type}.when`)}</span>
                </div>
              </div>
              <div className="nset__ch" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--sp-3)" }}>
                <p className="small" role="status" style={{ margin: 0, flex: "1 1 12rem" }}>{status}</p>
                <button
                  type="button" className={`btn btn--sm ${note.email ? "btn--line" : "btn--primary"}`} disabled={busy} aria-describedby={labelId}
                  data-testid={`email-${type}-toggle`}
                  onClick={() => void save({ [type]: { channels: { phone: note.phone, email: !note.email } } })}
                >
                  {note.email ? tr("notify.link.unsubButton") : tr("notify.emailLink.turnOn")}
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ borderTop: "var(--rule-w) solid var(--rule)" }} />
      </div>
      {failed && <p className="small" role="alert" style={{ color: "var(--berry)" }}>{tr("notify.saveFailed")}</p>}

      <div className="gate" style={{ marginTop: "var(--sp-5)" }} data-testid="email-settings-more">
        <h2 className="h3">{tr("notify.emailLink.moreTitle")}</h2>
        <p className="lede">{tr("notify.emailLink.moreBody")}</p>
        <div className="gate__acts">
          <Link className="btn btn--line" to="/login?returnTo=/more/notifications">{tr("notify.signedOut.signIn")}</Link>
        </div>
      </div>
      <p className="note">{tr("notify.footnote")}</p>
    </div>
  );
}
