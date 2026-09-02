// The COhere-account sign-in panel (regenOS magic link), shown on the
// calendar page when the lane is on and the browser is anonymous.
//
// Ported from regenhub-boulder's RegenosLoginPanel and re-cut for this site:
// where regenhub punted new users to its classic Supabase lane, here the
// signup wizard IS the lane — a new email gets the emailed link that opens
// /login?token=… and walks profile → account (src/pages/Login.tsx).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailCheck } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { beginSignup } from "@/lib/regenos";
import { useInvalidateRegenosSession } from "@/hooks/useRegenos";

/** Which view is on screen. `busy` is tracked separately so an in-flight
 *  request never yanks the view out from under the person. */
type Stage = "idle" | "checkEmail";

export function RegenosSignInPanel() {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const invalidateSession = useInvalidateRegenosSession();

  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [returning, setReturning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await beginSignup(email);
      if (result.stage === "login") {
        // Returning user whose session regenOS trusted immediately — no
        // inbox round-trip; the cookie just landed with the response.
        invalidateSession();
      } else if (result.stage === "chooseHandle") {
        // Ownership already proven (beta mode) — straight to the wizard's
        // handle step; no token to carry, the pending cookie is the state.
        navigate("/login");
      } else {
        setReturning(result.returningUser);
        setStage("checkEmail");
      }
    } catch {
      setError(tr("calendar.host.unreachable"));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "checkEmail") {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="p-6 text-center space-y-4">
          <MailCheck className="h-8 w-8 mx-auto text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{tr("calendar.host.checkEmailTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {returning
                ? tr("calendar.host.checkEmailBodyReturning")
                : tr("calendar.host.checkEmailBodyNew")}
            </p>
            <p className="text-sm font-medium text-foreground">{email}</p>
          </div>
          {/* The link opens in this browser: a returning user's tab is signed
              in the moment it's clicked, a new user's opens the wizard — this
              button just re-asks who we are for people who clicked elsewhere. */}
          <div className="flex flex-col gap-2">
            <Button variant="community" onClick={() => invalidateSession()}>
              {tr("calendar.host.checkEmailDone")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setStage("idle")}>
              {tr("calendar.host.tryAnotherEmail")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{tr("calendar.host.panelTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="regenos-email">{tr("calendar.host.emailLabel")}</Label>
            <Input
              id="regenos-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            <p className="text-xs text-muted-foreground">{tr("calendar.host.emailHelp")}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" variant="community" disabled={busy} className="w-full gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? tr("calendar.host.checking") : tr("calendar.host.continue")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
