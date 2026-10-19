import { Link } from "react-router-dom";
import { MapPin } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountControl } from "@/components/AccountControl";
import { EmailSignup } from "@/components/EmailSignup";
import { RegistrationAction } from "@/components/RegistrationAction";
import { lookClass, useLook } from "@/lib/look";
import { useAuthState } from "@/hooks/useRegenos";
import { TabBar } from "./TabBar";

/**
 * Masthead for the Almanac look: wordmark, tabs, language. `register` adds the
 * Register link the public site wants within reach on every screen; the app
 * screens (Today, Calendar, …) leave it off.
 */
export function AlmanacMast({ register = false }: { register?: boolean }) {
  const { language, setLanguage, tr } = useLanguage();
  const eco = useLook() === "ecology";
  const { signedIn, hold } = useAuthState();
  return (
    <header className={`mast${register ? " mast--sticky" : ""}`}>
      <Link className="wordmark" to="/" aria-label="[CO]here">[<i>CO</i>]here</Link>
      <div className="mast__end">
        {/* About is for visitors; on a device signed in last time it waits for the answer rather than flash. */}
        {eco && !signedIn && !hold && <Link className="mast__about" to="/about">{tr("nav.about")}</Link>}
        {register && <RegistrationAction className="mast__register" />}
        {/* regenOS sign-in / account: renders nothing unless the lane is on. */}
        <AccountControl variant="desktop" />
        <div className="lang" role="group" aria-label={tr("almanac.language")}>
          <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>En</button>
          <button type="button" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>Es</button>
        </div>
      </div>
      {/* After the controls in the DOM so keyboard order follows the rows the grid draws (wordmark, controls, then tabs). */}
      <TabBar />
    </header>
  );
}

/** The colophon: same words and links as the classic footer, set as a ruled page foot. */
export function AlmanacFooter() {
  const { tr, language, setLanguage } = useLanguage();
  const eco = useLook() === "ecology";
  return (
    <footer className="foot">
      <div className="foot__cols">
        <div className="stack">
          <p className="foot__brand">[<i>CO</i>]here</p>
          <p>{tr("footer.tagline")}</p>
          <p className="small foot__where"><MapPin className="h-4 w-4" aria-hidden="true" /> Boulder, Colorado</p>
        </div>
        <div className="stack foot__account"><AccountControl variant="mobile" /></div>
        <div className="stack foot__signup">
          <h2 className="h3">{tr("signup.title")}</h2>
          {/* The gathering is days away, so "as plans take shape" no longer fits. */}
          {eco ? (
            <p className="small foot__now">
              {tr("look.home.footerWhere")} · <Link className="link" to="/register">{tr("look.home.footerRegister")}</Link> / <Link className="link" to="/calendar">{tr("almanac.tabs.calendar")}</Link>
            </p>
          ) : <p className="small">{tr("footer.stayInLoop")}</p>}
          <EmailSignup source="footer" />
          {!eco && <p className="small">{tr("footer.dates2026")}</p>}
        </div>
      </div>
      <div className="foot__base">
        <span className="small">© 2026 [CO]here Boulder</span>
        <span className="small">{tr("footer.wovenWeb")}</span>
        <Link to="/about" className="link">{tr("nav.about")}</Link>
        <Link to="/propose" className="link">{tr("nav.proposeEvent")}</Link>
        <span className="foot__lang">
          <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
          <button type="button" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>Español</button>
        </span>
      </div>
    </footer>
  );
}

/** For pages that keep their classic body under ?look=almanac: just the chrome, in its own .alm scope. */
export function BareChrome({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  const eco = lookClass(useLook());
  return <div className={`alm${eco} alm--bare${sticky ? " alm--sticky" : ""}`}><div className="app">{children}</div></div>;
}
