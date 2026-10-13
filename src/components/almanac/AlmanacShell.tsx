import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Ctx } from "./shell-context";
import { AlmanacFooter, AlmanacMast } from "./SiteChrome";
import { EcoRidges } from "./EcoRidges";
import { InstallSheet } from "./InstallSheet";
import { lookClass, useLook } from "@/lib/look";
import { probeSubscription, syncReminderLanguage, useReminders } from "@/lib/reminders";
import { useDeviceSync } from "@/hooks/useDeviceSync";

/**
 * The app frame: masthead (wordmark, tabs, language), page, and the overlays
 * every screen shares (install sheet, toast). Everything under .alm picks up the
 * Almanac tokens; the rest of the site is untouched.
 */
export function AlmanacShell({ children, after, site = false, ridges = true }: { children: ReactNode; after?: ReactNode; site?: boolean; ridges?: boolean }) {
  const { language } = useLanguage();
  const look = useLook();
  const rootRef = useRef<HTMLDivElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState("");
  const [hasBar, setHasBar] = useState(false);
  const timer = useRef<number>();
  const { subscribed } = useReminders();
  useDeviceSync();

  useEffect(() => { setContainer(rootRef.current); probeSubscription(); }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // The stored push subscription speaks the site's language; keep them in step.
  useEffect(() => { if (subscribed) void syncReminderLanguage(language); }, [language, subscribed]);

  const toast = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMessage(text);
    timer.current = window.setTimeout(() => setMessage(""), 3600);
  }, []);

  return (
    <Ctx.Provider value={{ container, toast, setHasBar }}>
      <div className={`alm${lookClass(look)}`} ref={rootRef}>
        <div className={`app${hasBar ? " has-bar" : ""}`}>
          <AlmanacMast register={site || look === "ecology"} />
          {/* Ecology only: the landscape under the masthead. Screens that draw their own (Today, Calendar, Home) hide it with CSS or ridges={false}. */}
          {look === "ecology" && ridges && <EcoRidges />}
          {children}
          {(site || look === "ecology") && <AlmanacFooter />}
        </div>
        {after}
        {/* The public site asks for one thing, a registration; no install prompt on top of it. */}
        {!site && <InstallSheet />}
        {/* The live region stays mounted so screen readers announce the text when it appears. */}
        <div className="toast" role="status">{message}</div>
      </div>
    </Ctx.Provider>
  );
}
