// /join/:token — where a regenOS hosting-invite link lands (see
// worker/src/regenos-service.ts's `proposeInvite`, and CLAUDE.md's "Event
// management" section on invite tokens). Accepting the invite itself is a
// later PR — this page only explains what the link is and offers the two
// things a person can do about it today. It never calls regenOS: the token
// is redemption material and stays out of the browser entirely until an
// acceptance flow exists.

import { Link, useParams } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSiteConfig } from "@/hooks/useRegenos";

const ORGANIZER_EMAIL = "cohere@wovenweb.org";

export default function Join() {
  // The token identifies the invite upstream; nothing here reads or sends
  // it — it's only in the URL so a future acceptance flow has it to hand.
  useParams<{ token: string }>();
  const { tr } = useLanguage();
  const { data: config } = useSiteConfig();
  const loginOn = config?.regenosLoginEnabled === true;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="py-16">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="shadow-warm">
            <CardContent className="p-8 text-center space-y-4">
              <Sparkles className="h-10 w-10 mx-auto text-primary" aria-hidden="true" />
              <h1 className="text-3xl font-bold text-foreground">{tr("joinInvite.title")}</h1>
              <p className="text-muted-foreground">{tr("joinInvite.subtitle")}</p>
              <p className="text-muted-foreground">
                {loginOn ? tr("joinInvite.loginOnBody") : tr("joinInvite.loginOffBody")}
              </p>

              <div className="flex flex-wrap justify-center gap-3 pt-4">
                {loginOn && (
                  <Button asChild variant="community" className="gap-2">
                    <Link to="/login">
                      {tr("joinInvite.signInButton")}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                <Button asChild variant={loginOn ? "outline" : "community"} className="gap-2">
                  <Link to="/propose">
                    {tr("joinInvite.proposeButton")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="gap-2">
                  <a href={`mailto:${ORGANIZER_EMAIL}`}>
                    <Mail className="h-4 w-4" />
                    {tr("joinInvite.emailButton")}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
