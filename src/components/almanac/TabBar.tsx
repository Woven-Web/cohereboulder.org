import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { activeAppTab, activeEcoTab } from "@/lib/appRouting";
import { useLook } from "@/lib/look";

const TABS = [
  { id: "today", to: "/today" },
  { id: "events", to: "/calendar", key: "calendar" },
  { id: "board", to: "/board" },
  { id: "more", to: "/more" },
] as const;

const ECO_TABS = [
  { id: "home", to: "/" },
  { id: "today", to: "/today" },
  { id: "events", to: "/calendar", key: "calendar" },
  { id: "board", to: "/board" },
  { id: "people", to: "/people" },
  { id: "me", to: "/more" },
] as const;

/**
 * Ecology: Home · Today · Calendar · Board · People · Me, the same six
 * destinations as a phone's bottom bar and inline in the masthead from 768px.
 * Classic and Almanac keep Today · Calendar · Board · More.
 */
export function TabBar() {
  const { tr } = useLanguage();
  const { pathname } = useLocation();
  const eco = useLook() === "ecology";
  const tabs = eco ? ECO_TABS : TABS;
  const active = eco ? activeEcoTab(pathname) : activeAppTab(pathname);
  return (
    <nav className={`tabs${eco ? " tabs--six" : ""}`} aria-label={tr("almanac.main")} data-testid="app-tabs">
      {tabs.map((tab) => (
        <Link key={tab.id} to={tab.to} aria-current={active === tab.id ? "page" : undefined}>
          {tr(`almanac.tabs.${"key" in tab ? tab.key : tab.id}`)}
        </Link>
      ))}
    </nav>
  );
}
