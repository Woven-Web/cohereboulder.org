import { Button } from "@/components/ui/button";
import {
  MapPin,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
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
              Connecting local community to create a regenerative, resilient
              future.
            </p>
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Boulder, Colorado</span>
            </div>
          </div>

          {/* Stay in the Loop */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{tr("signup.title")}</h3>
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
            <div className="text-sm text-primary-foreground/60">
              <span>© 2026 [CO]here Boulder</span>
              <span className="mx-2">•</span>
              <span>{tr("footer.wovenWeb")}</span>
            </div>
            <div className="flex items-center space-x-4">
              {/* Language Toggle */}
              <div className="flex space-x-2 text-sm">
                <button
                  onClick={() => setLanguage("en")}
                  className={`hover:text-primary-foreground transition-colors ${
                    language === "en"
                      ? "text-primary-foreground"
                      : "text-primary-foreground/60"
                  }`}
                >
                  English
                </button>
                <span className="text-primary-foreground/60">|</span>
                <button
                  onClick={() => setLanguage("es")}
                  className={`hover:text-primary-foreground transition-colors ${
                    language === "es"
                      ? "text-primary-foreground"
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
