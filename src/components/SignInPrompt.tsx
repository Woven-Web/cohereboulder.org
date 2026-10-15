// "Already registered? Sign in" — for signed-out visitors, under a Register
// call to action. Renders nothing when the regenOS lane is off or the visitor
// is already signed in. Opens the navigation's sign-in dialog.

import { useLanguage } from "@/contexts/LanguageContext";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { openSignInDialog } from "@/lib/signin";
import { cn } from "@/lib/utils";

export function SignInPrompt({ className }: { className?: string }) {
  const { tr } = useLanguage();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session, isLoading } = useRegenosSession(laneOn);
  if (!laneOn || isLoading || session?.did) return null;
  return (
    <p className={cn("text-center text-sm", className)} data-testid="signin-prompt">
      {tr("app.alreadyRegistered")}{" "}
      <button type="button" className="underline font-semibold min-h-12 px-2" onClick={openSignInDialog}>
        {tr("nav.signIn")}
      </button>
    </p>
  );
}
