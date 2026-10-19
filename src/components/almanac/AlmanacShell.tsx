import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Ctx } from "./shell-context";
import { AlmanacFooter, AlmanacMast } from "./SiteChrome";
import { EcoRidges } from "./EcoRidges";
import { SignedInInstallInvite } from "./SignedInInstallInvite";
import { useLocation } from "react-router-dom";
import { InstallSheet } from "./InstallSheet";
import { NotifyStatusBar } from "@/components/notify/NotifyStatusBar";
import { lookClass, useLook } from "@/lib/look";
import { probeSubscription, syncReminderLanguage, useReminders } from "@/lib/reminders";
import { useDeviceSync } from "@/hooks/useDeviceSync";

/**
 * The app frame: masthead (wordmark, tabs, language), page, and the overlays
 * every screen shares (install sheet, toast). Everything under .alm picks up the
 * Almanac tokens; the rest of the site is untouched.
 */
export function AlmanacShell({ children, after, site = false, ridges = true, footer = true }: { children: ReactNode; after?: ReactNode; site?: boolean; ridges?: boolean; footer?: boolean }) {
  const { pathname } = useLocation();
  const installAllowed = !/^\/(register|login|admin)(?:\/|$)/.test(pathname);
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
          <NotifyStatusBar />
          {/* Ecology only: the landscape under the masthead. Screens that draw their own (Today, Calendar, Home) hide it with CSS or ridges={false}. */}
          {look === "ecology" && ridges && <EcoRidges />}
          {children}
          {/* footer={false}: a page still loading leaves it out, so it can't sit in view and be pushed down when the page arrives. */}
          {footer && (site || look === "ecology") && <AlmanacFooter />}
        </div>
        {after}
        {installAllowed && (!site || pathname === "/" || pathname === "/home") && <InstallSheet />}
        {installAllowed && <SignedInInstallInvite />}
        {/* The live region stays mounted so screen readers announce the text when it appears. */}
        <div className="toast" role="status">{message}</div>
      </div>
    </Ctx.Provider>
  );
}
