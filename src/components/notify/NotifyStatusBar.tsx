import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { NOTIFY_SETTINGS_KEY, fetchSettings, receivesNothing, thisDeviceId, type SettingsView } from "@/lib/notify";

/**
 * Home and Today, signed in only: when the person would get no notifications, one slim line that
 * says so and opens the settings. When they get something it stays out of the way.
 */
export function NotifyStatusBar() {
  const { pathname } = useLocation();
  const { tr } = useLanguage();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session } = useRegenosSession(laneOn);
  const did = laneOn ? session?.did ?? null : null;
  const here = pathname === "/" || pathname === "/home" || pathname === "/today";
  const { data: view } = useQuery<SettingsView>({
    queryKey: [...NOTIFY_SETTINGS_KEY, did],
    queryFn: () => fetchSettings(thisDeviceId()),
    enabled: here && Boolean(did),
    staleTime: 30_000,
    retry: 0,
  });
  if (!here || !did || !view || !receivesNothing(view)) return null;
  return (
    <Link className="notifybar" to="/more/notifications" data-testid="notify-status-bar">
      <span>{tr("notify.bar.none")}</span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}
