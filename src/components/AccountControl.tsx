import { displayHandle } from "@/lib/handles";
// The "Sign in" / account control in the top navigation. Renders nothing
// unless /api/config says the regenOS lane is on. Anonymous: a button that
// opens the existing regenOS email sign-in (RegenosSignInPanel) in a dialog.
// Signed in: the handle, with a small menu to sign out.
//
// Anything else on the page can open the dialog with openSignInDialog()
// (src/lib/signin.ts).

import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RegenosSignInPanel } from "@/components/RegenosSignInPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuthState, useInvalidateRegenosSession } from "@/hooks/useRegenos";
import { signOut } from "@/lib/regenos";
import { OPEN_SIGNIN_EVENT, openSignInDialog, type SignInPrefill } from "@/lib/signin";
import { useShell } from "@/components/almanac/shell-context";

export function AccountControl({ variant = "desktop", onNavigate }: { variant?: "desktop" | "mobile"; onNavigate?: () => void }) {
  const { tr } = useLanguage();
  const { container } = useShell();
  const { laneOn: enabled, configPending, session, signedIn, hold } = useAuthState();
  const invalidateSession = useInvalidateRegenosSession();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<SignInPrefill>({});

  // Only the desktop instance listens, so one request opens one dialog.
  useEffect(() => {
    if (variant !== "desktop") return;
    const listener = (event: Event) => {
      setPrefill((event as CustomEvent<SignInPrefill | undefined>).detail ?? {});
      setOpen(true);
    };
    window.addEventListener(OPEN_SIGNIN_EVENT, listener);
    return () => window.removeEventListener(OPEN_SIGNIN_EVENT, listener);
  }, [variant]);

  // Signing in (a returning user, or the other tab's link) closes the dialog.
  useEffect(() => {
    if (signedIn) setOpen(false);
  }, [signedIn]);

  // Not known yet whether sign-in is on, or (on a device signed in last time) who this is: keep the
  // control's place, empty, so neither "Sign in" flashes at a member nor the masthead jumps when it lands.
  if (configPending || hold) {
    return (
      <Button variant={variant === "mobile" ? "outline" : "ghost"} size={variant === "mobile" ? "default" : "sm"} className={variant === "mobile" ? "mx-3 mt-2" : undefined} aria-hidden="true" tabIndex={-1} style={{ visibility: "hidden" }} data-testid="account-pending">
        {tr("nav.signIn")}
      </Button>
    );
  }
  if (!enabled) return null;

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      await invalidateSession();
      onNavigate?.();
    }
  }

  const who = displayHandle(session?.handle) || session?.did || "";

  if (signedIn) {
    if (variant === "mobile") {
      return (
        <div className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
          <span className="min-w-0 text-sm text-muted-foreground">
            {tr("nav.signedInAs")} <span className="inline-block max-w-full font-medium text-foreground break-all" data-testid="nav-handle">{who}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1 shrink-0">
            <LogOut className="h-4 w-4" aria-hidden />
            {tr("nav.signOut")}
          </Button>
        </div>
      );
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 min-h-11" aria-label={who} title={who}>
            <UserRound className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden xl:inline-block max-w-[24ch] truncate" data-testid="nav-handle">{who}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="font-normal text-muted-foreground">
            {tr("nav.signedInAs")} <span className="font-medium text-foreground break-all">{who}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut} className="gap-2 min-h-12">
            <LogOut className="h-4 w-4" aria-hidden />
            {tr("nav.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const trigger =
    variant === "mobile" ? (
      <Button
        variant="outline"
        className="mx-3 mt-2"
        onClick={() => {
          onNavigate?.();
          openSignInDialog();
        }}
      >
        {tr("nav.signIn")}
      </Button>
    ) : (
      <Button variant="ghost" size="sm" onClick={openSignInDialog}>
        {tr("nav.signIn")}
      </Button>
    );

  if (variant === "mobile") return trigger;

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent container={container} closeLabel={tr("nav.closeDialog")} className="signin-dlg max-w-md w-[calc(100%-2rem)] rounded-lg [&>button]:min-h-12 [&>button]:min-w-12 [&>button]:right-0 [&>button]:top-0 [&>button]:flex [&>button]:items-center [&>button]:justify-center">
          <DialogHeader>
            <DialogTitle className="px-5 sm:pl-0">{tr("nav.signInDialogTitle")}</DialogTitle>
            <DialogDescription>{tr("nav.signInDialogBody")}</DialogDescription>
          </DialogHeader>
          <RegenosSignInPanel embedded initialEmail={prefill.email} returnTo={prefill.returnTo} />
        </DialogContent>
      </Dialog>
    </>
  );
}
