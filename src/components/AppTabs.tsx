import { Link, useLocation } from "react-router-dom";
import { CalendarDays, MessageSquare } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { activeAppTab } from "@/lib/appRouting";

export function AppTabs({ bottom = false }: { bottom?: boolean }) {
  const { tr } = useLanguage();
  const active = activeAppTab(useLocation().pathname);

  return (
    <nav
      aria-label={tr("app.tabs")}
      data-testid={bottom ? "bottom-tabs" : "header-tabs"}
      className={bottom ? "app-bottom-tabs" : "hidden md:flex self-stretch shrink-0 gap-2"}
    >
      {(["events", "board"] as const).map(tab => {
        const Icon = tab === "events" ? CalendarDays : MessageSquare;
        return (
          <Link
            key={tab}
            to={`/${tab}`}
            aria-current={active === tab ? "page" : undefined}
            className={`flex min-h-12 items-center justify-center gap-2 px-4 border-b-4 ${
              active === tab ? "border-foreground font-bold bg-muted" : "border-transparent"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {tr(`app.${tab}`)}
          </Link>
        );
      })}
    </nav>
  );
}
