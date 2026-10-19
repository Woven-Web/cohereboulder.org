import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useAuthState, useMyRegistration } from "@/hooks/useRegenos";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = React.HTMLAttributes<HTMLElement> & { anonymousKey?: string };
export const RegistrationAction = forwardRef<HTMLElement, Props>(function RegistrationAction({ anonymousKey = "nav.register", ...props }, ref) {
  const { tr } = useLanguage();
  const { session, hold } = useAuthState();
  const { data, isLoading } = useMyRegistration();
  // Not yet known whether this member is registered (or, on a device signed in last time, who this is):
  // keep the button's place, empty, rather than flash "Join COhere" at a member.
  if (hold || (session?.did && isLoading)) return (
    <span ref={ref as React.Ref<HTMLSpanElement>} className={props.className} aria-hidden="true" style={{ visibility: "hidden" }} data-testid="registration-pending">
      {tr(anonymousKey)}
    </span>
  );
  if (data?.registered) return (
    <span
      ref={ref as React.Ref<HTMLSpanElement>}
      role="status"
      className={cn(props.className, "items-center justify-center gap-2 border-0 rounded-full w-fit h-auto min-h-0 mx-auto px-3 py-1 bg-secondary text-secondary-foreground shadow-none cursor-default hover:bg-secondary hover:text-secondary-foreground hover:shadow-none hover:scale-100")}
    >
      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
      {tr("app.registered")}
    </span>
  );
  const quiet = Boolean(session?.did) && data?.registered !== false;
  return <Link {...props} className={quiet ? cn(props.className, "border-0 bg-transparent shadow-none hover:bg-transparent text-sm text-muted-foreground underline underline-offset-4") : props.className} ref={ref as React.Ref<HTMLAnchorElement>} to="/register">{tr(session?.did ? data?.registered === false ? "app.registerGathering" : "nav.register" : anonymousKey)}</Link>;
});
