import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { openSignInDialog } from "@/lib/signin";

export default function Board() {
  const { tr } = useLanguage();
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="max-w-3xl mx-auto px-5 py-16 sm:py-24">
        <div className="rounded-xl border-2 border-slate-400 p-6 sm:p-12 space-y-6">
          <MessageSquare className="h-10 w-10" aria-hidden />
          <p className="font-semibold text-sm uppercase tracking-wider">{tr("app.membersOnly")}</p>
          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">{tr("app.boardTitle")}</h1>
          <p className="text-lg leading-relaxed text-slate-600">{tr("app.boardBody")}</p>
          {!session?.did && (
            <>
              <p>{tr("app.boardGate")}</p>
              {config?.regenosLoginEnabled ? (
                <Button className="min-h-12" variant="rsvp" onClick={openSignInDialog}>
                  {tr("nav.register")}
                </Button>
              ) : (
                <Button asChild className="min-h-12" variant="rsvp">
                  <Link to="/register">{tr("nav.register")}</Link>
                </Button>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
