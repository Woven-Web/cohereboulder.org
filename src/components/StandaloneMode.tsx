import { useEffect } from "react";

// Marks <html> when the site runs as an installed app, so CSS can suppress
// overscroll. Navigation itself is the shared AppTabs bar.
export function StandaloneMode() {
  useEffect(() => {
    const media = matchMedia("(display-mode: standalone)");
    const update = () =>
      document.documentElement.classList.toggle(
        "companion-standalone",
        media.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
      document.documentElement.classList.remove("companion-standalone");
    };
  }, []);
  return null;
}
