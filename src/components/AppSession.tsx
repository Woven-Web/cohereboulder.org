import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { signInDestination, shouldRedirectToApp } from "@/lib/appRouting";

// Keep the return path across tabs: email links often open a fresh tab.
export function AppSession() {
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  const location = useLocation();
  const navigate = useNavigate();
  const previous = useRef<boolean | undefined>();

  useEffect(() => {
    if (!session) return;
    const signedIn = Boolean(session.did);
    if (shouldRedirectToApp(signedIn, previous.current, location.pathname)) {
      const explicit = new URLSearchParams(location.search).get("returnTo")
        ?? localStorage.getItem("cohere:returnTo");
      // Only the magic-link landing consumes the path. The original tab
      // may discover the same session first when focus changes.
      if (location.pathname === "/" || location.pathname === "/login") {
        localStorage.removeItem("cohere:returnTo");
      }
      navigate(signInDestination(explicit), { replace: true });
    }
    previous.current = signedIn;
  }, [session, location.pathname, location.search, navigate]);
  return null;
}
