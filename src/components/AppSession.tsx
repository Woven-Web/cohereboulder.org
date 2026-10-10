import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMyRegistration, useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { signInDestination, shouldRedirectToApp } from "@/lib/appRouting";

// Keep the return path across tabs: email links often open a fresh tab.
export function AppSession() {
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  const registration = useMyRegistration();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session || registration.isLoading) return;
    const signedIn = Boolean(session.did);
    if (shouldRedirectToApp(signedIn, location.pathname, location.search)) {
      const explicit = new URLSearchParams(location.search).get("returnTo")
        ?? localStorage.getItem("cohere:returnTo");
      // Only the magic-link landing consumes the path. The original tab
      // may discover the same session first when focus changes.
      localStorage.removeItem("cohere:returnTo");
      navigate(signInDestination(explicit, registration.data?.registered === true), { replace: true });
    }
  }, [session, registration.isLoading, registration.data?.registered, location.pathname, location.search, navigate]);
  return null;
}
