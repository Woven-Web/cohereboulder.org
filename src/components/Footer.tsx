import {
  MapPin,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { EmailSignup } from "@/components/EmailSignup";

export const Footer = () => {
  const { tr, language, setLanguage } = useLanguage();

  return (
    <footer className="bg-earth-warm text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Brand */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <img
                src={`${import.meta.env.BASE_URL}COHERE-Logo-Branding-2.webp`}
                alt="[CO]here Logo"
                className="h-10 w-auto brightness-0 invert"
              />
              <span className="text-2xl font-bold">[CO]here</span>
            </div>
            <p className="text-primary-foreground/80 leading-relaxed">
              {tr("footer.tagline")}
            </p>
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Boulder, Colorado</span>
            </div>
          </div>

          {/* Stay in the Loop */}
          <div className="space-y-6">
            {/* An H2, not H3: several pages (Register, Calendar, Login) have
                no H2 of their own before this footer renders, which left the
                heading order skipping from H1 straight to H3. Fixed here so
                every page that uses this shared footer gets it at once. */}
            <h2 className="text-lg font-semibold">{tr("signup.title")}</h2>
            <p className="text-sm text-primary-foreground/80">
              {tr("footer.stayInLoop")}
            </p>
            <EmailSignup source="footer" />
            <p className="text-sm text-primary-foreground/80">
              {tr("footer.dates2026")}
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-primary-foreground/10">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center md:justify-start items-center gap-x-4 text-sm text-primary-foreground/80">
              <span>© 2026 [CO]here Boulder</span>
              <span>{tr("footer.wovenWeb")}</span>
              <Link to="/about" className="inline-flex min-h-11 items-center hover:underline">{tr("nav.about")}</Link>
              <Link to="/propose" className="inline-flex min-h-11 items-center hover:underline">{tr("nav.proposeEvent")}</Link>
            </div>
            <div className="flex items-center space-x-4">
              {/* Language Toggle */}
              <div className="flex items-center space-x-2 text-sm">
                <button
                  onClick={() => setLanguage("en")}
                  aria-pressed={language === "en"}
                  className={`min-h-11 px-2 hover:text-primary-foreground transition-colors ${
                    language === "en"
                      ? "text-primary-foreground font-semibold underline underline-offset-4"
                      : "text-primary-foreground/60"
                  }`}
                >
                  English
                </button>
                <span className="text-primary-foreground/60">|</span>
                <button
                  onClick={() => setLanguage("es")}
                  aria-pressed={language === "es"}
                  className={`min-h-11 px-2 hover:text-primary-foreground transition-colors ${
                    language === "es"
                      ? "text-primary-foreground font-semibold underline underline-offset-4"
                      : "text-primary-foreground/60"
                  }`}
                >
                  Español
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
