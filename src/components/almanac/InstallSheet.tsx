import { useState } from "react";
import { Share, SquarePlus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { clearInstallPrompt } from "@/lib/install";
import { closeInstallSheet, rememberDismissed, useInstallSheet } from "@/lib/installOffer";
import { enableReminders, useReminders } from "@/lib/reminders";
import { useInstallOffer } from "@/lib/useInstallOffer";
import { useCompanionToday } from "@/lib/useCompanionToday";
import { BottomSheet } from "./BottomSheet";
import { useShell } from "./shell-context";

/**
 * "Add to home screen & get reminders", offered once after the first "I did it"
 * or when someone asks for a reminder, and always available from More.
 *
 *  - Android/desktop Chrome: the captured beforeinstallprompt, then (a second
 *    tap, because the permission request needs its own gesture) reminders.
 *  - iOS Safari: the three-step Share guide; reminders start from the Home Screen.
 *  - Nothing installable but push works: just the reminders.
 */
export function InstallSheet() {
  const { tr, language } = useLanguage();
  const { toast } = useShell();
  const sheet = useInstallSheet();
  const { ios, prompt, canRemind } = useInstallOffer();
  const { data } = useCompanionToday();
  const reminders = useReminders();
  const [stage, setStage] = useState<"offer" | "set">("offer");
  const [busy, setBusy] = useState(false);

  const close = () => { closeInstallSheet(); window.setTimeout(() => setStage("offer"), 300); };
  const notNow = () => { if (sheet.reason !== "manual") rememberDismissed(); close(); };
  const open = sheet.open;

  async function install() {
    if (!prompt) return;
    setBusy(true);
    try {
      // prompt() has to be called straight from the tap.
      const shown = prompt.prompt();
      const choice = await prompt.userChoice;
      await shown;
      clearInstallPrompt();
      if (choice.outcome === "accepted") setStage("set");
      else notNow();
    } catch {
      toast(tr("almanac.installError"));
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    if (!data?.pushKey) return;
    await enableReminders(data.pushKey, language);
    if (stage === "offer") close();
  }

  if (ios) {
    return (
      <BottomSheet open={open} onOpenChange={(v) => { if (!v) notNow(); }} title={tr("almanac.iosTitle")} description={tr("almanac.iosBody")}>
        <ol className="steps">
          <li>
            <div>{tr("almanac.iosStep1")}
              <div className="ill"><span className="hl"><Share size={24} aria-hidden="true" /></span><span>{tr("almanac.iosStep1Cap")}</span></div></div>
          </li>
          <li>
            <div>{tr("almanac.iosStep2")}
              <div className="ill"><span className="hl"><SquarePlus size={24} aria-hidden="true" /></span><span>{tr("almanac.iosStep2Cap")}</span></div></div>
          </li>
          <li>
            <div>{tr("almanac.iosStep3")}
              <div className="ill"><img src="/cohere-icon-192.png" alt="" width="40" height="40" style={{ borderRadius: 9 }} /><span>COhere</span></div></div>
          </li>
        </ol>
        <p className="sheet__fine">{tr("almanac.iosFine")}</p>
        <button type="button" className="btn btn--primary btn--block" onClick={() => { rememberDismissed(); close(); toast(tr("almanac.iosToast")); }}>{tr("almanac.gotIt")}</button>
        <button type="button" className="btn btn--quiet btn--block" onClick={notNow}>{tr("almanac.notNow")}</button>
      </BottomSheet>
    );
  }

  if (stage === "set") {
    return (
      <BottomSheet open={open} onOpenChange={(v) => { if (!v) close(); }} title={tr("almanac.setTitle")} description={reminders.subscribed ? tr("almanac.setBodyOn") : tr("almanac.setBody")}>
        <Times />
        {!reminders.subscribed && canRemind && (
          <button type="button" className="btn btn--primary btn--block" disabled={reminders.busy} onClick={() => void remind()}>{tr("almanac.turnOn")}</button>
        )}
        <button type="button" className={`btn ${reminders.subscribed || !canRemind ? "btn--primary" : "btn--quiet"} btn--block`} onClick={close}>{tr("almanac.backToToday")}</button>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => { if (!v) notNow(); }}
      title={sheet.reason === "reminders" ? tr("almanac.installTitleReminders") : tr("almanac.installTitleDidit")}
      description={prompt ? tr("almanac.installBody") : tr("almanac.remindersOnlyBody")}
    >
      <Times />
      <p className="sheet__fine">{tr("almanac.installFine")}</p>
      {prompt ? (
        <button type="button" className="btn btn--primary btn--block" disabled={busy} onClick={() => void install()}>{tr("almanac.installPair")}</button>
      ) : (
        <button type="button" className="btn btn--primary btn--block" disabled={reminders.busy || !canRemind} onClick={() => void remind()}>{tr("almanac.getReminders")}</button>
      )}
      <button type="button" className="btn btn--quiet btn--block" onClick={notNow}>{tr("almanac.notNow")}</button>
    </BottomSheet>
  );
}

function Times() {
  const { tr } = useLanguage();
  return (
    <ul className="times">
      <li><b>6 AM</b><span>{tr("almanac.time6")}</span></li>
      <li><b>9 AM</b><span>{tr("almanac.time9")}</span></li>
      <li><b>3 PM</b><span>{tr("almanac.time15")}</span></li>
    </ul>
  );
}
