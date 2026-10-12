import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { activeAppTab } from "@/lib/appRouting";

const TABS = [
  { id: "today", to: "/today" },
  { id: "events", to: "/calendar", key: "calendar" },
  { id: "board", to: "/board" },
  { id: "more", to: "/more" },
] as const;

/** Today · Calendar · Board · More. Bottom bar on phones, inline in the masthead on the Daylight. */
export function TabBar() {
  const { tr } = useLanguage();
  const active = activeAppTab(useLocation().pathname);
  return (
    <nav className="tabs" aria-label={tr("almanac.main")} data-testid="app-tabs">
      {TABS.map((tab) => (
        <Link key={tab.id} to={tab.to} aria-current={active === tab.id ? "page" : undefined}>
          {tr(`almanac.tabs.${"key" in tab ? tab.key : tab.id}`)}
        </Link>
      ))}
    </nav>
  );
}
