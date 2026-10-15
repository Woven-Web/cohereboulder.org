import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { openSignInWith } from "@/lib/signin";
import { fetchMyRegistrationDetail, type SubmitOutcome } from "@/lib/api";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { DynamicForm } from "@/components/DynamicForm";
import { SignInPrompt } from "@/components/SignInPrompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlmanacShell } from "@/components/almanac/AlmanacShell";
import { useLook } from "@/lib/look";

const FORM = "register-2026";

const Registration = () => {
  const { tr, language } = useLanguage();
  const { data: config } = useSiteConfig();
  const laneOn = config?.regenosLoginEnabled === true;
  const { data: session, isLoading: sessionLoading } = useRegenosSession(laneOn);
  const did = session?.did ?? null;
  // Signed in: the form is "your registration" — the account's verified email,
  // and the saved answers if there are any. Under ["my-registration"], so a
  // submit refreshes it with the light registered/not query.
  const mine = useQuery({
    queryKey: ["my-registration", did, "detail"],
    queryFn: fetchMyRegistrationDetail,
    enabled: Boolean(did),
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const look = useLook();
  const spanish = language === "es";
  const saved = mine.data?.email ? mine.data : null;
  const editing = saved?.registered === true;
  const waiting = laneOn && (sessionLoading || (Boolean(did) && mine.isLoading));
  // A blank form would save over their registration if regenOS came back
  // before they pressed submit, so a signed-in visitor gets no form until the
  // saved answers load.
  const loadFailed = laneOn && Boolean(did) && mine.isError && !mine.data;

  const card = (children: React.ReactNode, testId: string) => (
    <Card className="df-card max-w-2xl mx-auto shadow-warm" data-testid={testId}>
      <CardContent className="pt-10 pb-10 text-center space-y-4">{children}</CardContent>
    </Card>
  );

  // After a new registration: invite an account (signed out), or point at the calendar (signed in).
  const successExtra = (email: string) => {
    if (!laneOn) return null;
    if (did) {
      return (
        <div className="space-y-2 pt-2" data-testid="register-signed-in">
          <p className="font-medium">{tr("app.youreSignedIn")}</p>
          <Button asChild size="lg" variant="community">
            <Link to="/events">{tr("nav.calendar")}</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="pt-2">
        <Button size="lg" variant="community" data-testid="register-create-account" onClick={() => openSignInWith({ email, returnTo: "/events" })}>
          {tr("app.createAccountToRsvp")}
        </Button>
      </div>
    );
  };

  const renderOutcome = (outcome: SubmitOutcome, email: string) => {
    if (outcome.alreadyRegistered) {
      return card(
        <>
          <p className="text-lg">{tr("app.emailAlreadyRegistered")}</p>
          {laneOn && !did && (
            <Button size="lg" variant="community" onClick={() => openSignInWith({ email, returnTo: "/register?edit=1" })}>
              {tr("nav.signIn")}
            </Button>
          )}
        </>,
        "register-already",
      );
    }
    if (outcome.updated) {
      return card(
        <>
          <CheckCircle2 className="h-12 w-12 mx-auto text-nature-green" aria-hidden />
          <h2 className="text-2xl font-bold">{tr("app.registrationUpdated")}</h2>
          <Button asChild size="lg" variant="community">
            <Link to="/events">{tr("nav.calendar")}</Link>
          </Button>
        </>,
        "register-updated",
      );
    }
    return null;
  };

  const form = waiting ? (
    <div className="flex justify-center py-16 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
    </div>
  ) : loadFailed ? (
    card(
      <>
        <p className="text-lg">{tr("app.registrationLoadFailed")}</p>
        <Button size="lg" variant="community" disabled={mine.isFetching} onClick={() => void mine.refetch()}>
          {mine.isFetching && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
          {tr("app.tryAgain")}
        </Button>
      </>,
      "register-load-failed",
    )
  ) : (
    <DynamicForm
      // A new identity is a new form: signing in from the "already registered" card reloads it as theirs.
      key={did ?? "anonymous"}
      slug={FORM}
      saved={saved}
      intro={editing ? <p className="text-lg font-medium" data-testid="register-editing">{tr("app.updateRegistration")}</p> : undefined}
      submitLabel={editing ? tr("app.saveChanges") : undefined}
      successExtra={successExtra}
      renderOutcome={renderOutcome}
      successTitle={spanish ? "¡Estás dentro!" : "You're woven in!"}
      successMessage={
        spanish
          ? "Gracias por registrarte. Te escribiremos a medida que COhere 2026 tome forma, y podrás elegir tu propia aventura desde el calendario comunitario."
          : "Thanks for registering. We'll be in touch as COhere 2026 takes shape — and you'll be able to choose your own adventure from the community calendar."
      }
    />
  );
  const lede = spanish
    ? "Regístrate para recibir novedades y mantenerte al tanto de lo que se está tejiendo. Registrarse es gratis y todos los eventos son opcionales."
    : "Register to receive communications and stay up to date with what's unfolding. Registration is free and every event is opt-in.";

  // The Almanac look keeps the page to what it was: heading, one sentence, the
  // dates, then the form. Nothing sits between the visitor and the first question.
  if (look !== "classic") {
    return (
      <AlmanacShell site>
        <main className="page register">
          <header className="register__head">
            <p className="folio">{tr("hero.dates")}</p>
            <h1 className="h1">{tr("hero.tagline")}</h1>
            <p className="lede">{lede}</p>
          </header>
          <SignInPrompt />
          {form}
        </main>
      </AlmanacShell>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="text-center space-y-4">
            <h1 className="text-4xl lg:text-5xl font-bold">{tr("hero.tagline")}</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">{lede}</p>
            <p className="text-lg font-medium text-primary">{tr("hero.dates")}</p>
          </div>

          <SignInPrompt />
          {form}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Registration;
