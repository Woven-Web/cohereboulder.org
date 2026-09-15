import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, Compass } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const NotFound = () => {
  const location = useLocation();
  const { tr } = useLanguage();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />

      <main className="flex-1 flex items-center py-20">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <Compass className="h-12 w-12 mx-auto text-primary" aria-hidden="true" />
          <h1 className="text-4xl lg:text-5xl font-bold text-foreground">
            {tr("notFound.title")}
          </h1>
          <p className="text-lg text-muted-foreground">{tr("notFound.body")}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button asChild variant="community" className="gap-2">
              <Link to="/">
                {tr("notFound.home")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/calendar">{tr("notFound.calendar")}</Link>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default NotFound;
