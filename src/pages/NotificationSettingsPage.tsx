import { Link } from "react-router-dom";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { NotificationSettings } from "@/components/notify/NotificationSettings";
import { useLanguage } from "@/contexts/LanguageContext";

/** More › Notifications: three notes, each on or off, and how each reaches you. */
export default function NotificationSettingsPage() {
  const { tr } = useLanguage();
  return (
    <AlmanacShell>
      <main className="page" style={{ paddingTop: 0 }}>
        <Link className="link" to="/more" style={{ marginTop: ".4rem" }}>← {tr("notify.more")}</Link>
        <div className="folio" style={{ marginTop: ".2rem" }}>{tr("notify.more")} › {tr("notify.title")}</div>
        <h1 className="h1" style={{ margin: ".5rem 0 .2rem" }}>{tr("notify.title")}</h1>
        <p className="lede" style={{ color: "var(--ink-2)" }}>{tr("notify.lede")}</p>
        <NotificationSettings />
      </main>
    </AlmanacShell>
  );
}
