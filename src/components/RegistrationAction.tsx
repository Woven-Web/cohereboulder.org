import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useMyRegistration, useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = React.HTMLAttributes<HTMLElement> & { anonymousKey?: string };
export const RegistrationAction = forwardRef<HTMLElement, Props>(function RegistrationAction({ anonymousKey = "nav.register", ...props }, ref) {
  const { tr } = useLanguage();
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  const { data } = useMyRegistration();
  if (data?.registered) return <span {...props} ref={ref as React.Ref<HTMLSpanElement>} role="status">{tr("app.registered")}</span>;
  const quiet = Boolean(session?.did) && data?.registered !== false;
  return <Link {...props} className={quiet ? cn(props.className, "border-0 bg-transparent shadow-none hover:bg-transparent text-sm text-muted-foreground underline underline-offset-4") : props.className} ref={ref as React.Ref<HTMLAnchorElement>} to="/register">{tr(session?.did ? data?.registered === false ? "app.registerGathering" : "nav.register" : anonymousKey)}</Link>;
});
