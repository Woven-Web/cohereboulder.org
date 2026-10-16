import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { closeInstallSheet, getSheetState, offerInstall, signedInInstallEligible } from "@/lib/installOffer";
import { useInstallOffer } from "@/lib/useInstallOffer";

/** Wait for a quiet moment on a reading screen; never interrupt an editor. */
export function SignedInInstallInvite() {
  const { pathname } = useLocation();
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  const { installed, ios, prompt } = useInstallOffer();
  const eligible = signedInInstallEligible({
    pathname, signedIn: !!session?.did,
    phone: /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent),
    installPath: ios || !!prompt,
  });

  useEffect(() => {
    if (!eligible || installed) return;
    let editing = false;
    const onInput = () => { editing = true; };
    document.addEventListener("input", onInput);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || editing ||
          document.activeElement?.matches("input, textarea, select, [contenteditable=true]") ||
          document.querySelector('[role="dialog"], [role="alertdialog"]') ||
          ((pathname !== "/" && pathname !== "/home") && document.querySelector("form"))) return;
      if (offerInstall("signedin", { installed, hasSomethingToOffer: ios || !!prompt })) {
        window.clearInterval(timer);
      }
    }, 3000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("input", onInput);
      if (getSheetState().reason === "signedin") closeInstallSheet();
    };
  }, [eligible, installed, pathname, ios, prompt]);
  return null;
}
