// /login — where a NEW user's emailed magic link lands (?token=…), and the
// short wizard that follows: verifySignup (redeem the link) → setSignupProfile
// (pick a handle) → createCustodialAccount (the account + session are minted).
//
// Returning users never see this page: their emailed link hits the Worker's
// /xrpc verifyEmail proxy directly, which 302s them to "/" already signed in.
//
// The wizard state lives in regenOS's own `__Host-rs_pending` cookie (set by
// beginSignup, HttpOnly), which is why the link must be opened in the browser
// that started the sign-in — a mismatch is the "invalid link" screen.
//
// Only reachable in practice when REGENOS_LOGIN_ENABLED is on: with the flag
// off no emailed link ever points here, and every /xrpc call underneath
// answers 404 — which renders as the same honest "invalid link" screen.

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Loader2, PartyPopper } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useInvalidateRegenosSession } from "@/hooks/useRegenos";
import { createCustodialAccount, setSignupProfile, verifySignupToken } from "@/lib/regenos";

type Stage = "verifying" | "chooseHandle" | "creating" | "done" | "invalid";

export default function Login() {
  const { tr } = useLanguage();
  const [params] = useSearchParams();
  const invalidateSession = useInvalidateRegenosSession();

  const token = params.get("token");
  // No token = the beta-mode entrance, where beginSignup already proved the
  // email and sent the browser here to pick a handle directly.
  const [stage, setStage] = useState<Stage>(token ? "verifying" : "chooseHandle");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const redeemed = useRef(false);

  useEffect(() => {
    if (!token || redeemed.current) return;
    // The token is single-use; a StrictMode double-mount must not burn it twice.
    redeemed.current = true;
    verifySignupToken(token)
      .then(() => setStage("chooseHandle"))
      .catch(() => setStage("invalid"));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStage("creating");
    setError(null);
    try {
      await setSignupProfile(handle.trim());
      await createCustodialAccount();
      // The session cookie just landed; tell the rest of the app to re-ask.
      invalidateSession();
      setStage("done");
    } catch (err) {
      // A taken handle (upstream 409) or a validation 400 — say what upstream
      // said and let the person pick again.
      setError(err instanceof Error ? err.message : tr("calendar.host.genericError"));
      setStage("chooseHandle");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-12">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          {stage === "verifying" ? (
            <p className="text-center text-muted-foreground py-16">
              <Loader2 className="h-5 w-5 animate-spin inline-block mr-2 align-text-bottom" />
              {tr("login.verifying")}
            </p>
          ) : stage === "invalid" ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <h1 className="text-2xl font-bold text-foreground">{tr("login.invalidTitle")}</h1>
                <p className="text-muted-foreground">{tr("login.invalidBody")}</p>
                <Button asChild variant="community" className="gap-2">
                  <Link to="/calendar">
                    {tr("login.goToCalendar")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : stage === "done" ? (
            <Card>
              <CardContent className="p-8 text-center space-y-3">
                <PartyPopper className="h-8 w-8 mx-auto text-primary" aria-hidden />
                <h1 className="text-2xl font-bold text-foreground">{tr("login.welcomeTitle")}</h1>
                <p className="text-muted-foreground">{tr("login.welcomeBody")}</p>
                <Button asChild variant="community" className="gap-2">
                  <Link to="/calendar">
                    {tr("login.goToCalendar")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground">
                      {tr("login.chooseHandleTitle")}
                    </h1>
                    <p className="text-sm text-muted-foreground">{tr("login.chooseHandleBody")}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-handle">{tr("login.handleLabel")}</Label>
                    <Input
                      id="signup-handle"
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="firefly"
                      autoComplete="off"
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button
                    type="submit"
                    variant="community"
                    disabled={stage === "creating"}
                    className="w-full gap-2"
                  >
                    {stage === "creating" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {stage === "creating" ? tr("login.creating") : tr("login.finishButton")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
