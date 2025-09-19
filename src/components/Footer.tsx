import { Button } from "@/components/ui/button";
import {
  Calendar,
  Mail,
  MessageCircle,
  MapPin,
  ExternalLink,
  User,
  LogOut,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Footer = () => {
  const { tr, language, setLanguage } = useLanguage();
  const { user, signOut } = useAuth();

  return (
    <footer className="bg-earth-warm text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
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
              {tr("footer.description")}
            </p>
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Boulder, Colorado</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{tr("footer.connect")}</h3>
            <div className="space-y-3">
              <a
                href="#calendar"
                className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <Calendar className="h-4 w-4" />
                <span>{tr("footer.eventCalendar")}</span>
              </a>
              <a
                href="#"
                className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{tr("footer.telegramCommunity")}</span>
              </a>
              <a
                href="#"
                className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <Mail className="h-4 w-4" />
                <span>{tr("footer.newsletter")}</span>
              </a>
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{tr("footer.resources")}</h3>
            <div className="space-y-3">
              <a
                href="#"
                className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{tr("footer.gameplayInstructions")}</span>
              </a>
              <a
                href="#"
                className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{tr("footer.regenerativeMap")}</span>
              </a>
              <a
                href="#"
                className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                <span>{tr("footer.webMap")}</span>
              </a>
            </div>
          </div>

          {/* Join */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">{tr("footer.joinUs")}</h3>
            <div className="space-y-3">
              <Button
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => window.open("/join-2025", "_self")}
              >
                {tr("footer.registration2025")}
              </Button>
              <Button
                variant="outline"
                className="w-full border-primary-foreground/20 hover:bg-primary-foreground/10"
                onClick={() => window.open("/join-2025", "_self")}
              >
                {tr("footer.learnMore")}
              </Button>
            </div>
            <p className="text-sm text-primary-foreground/80">
              {tr("footer.dates2025")}
            </p>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-8 border-t border-primary-foreground/10">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="text-sm text-primary-foreground/60">
              <span>© 2024 [CO]here Boulder</span>
              <span className="mx-2">•</span>
              <span>{tr("footer.wovenWeb")}</span>
            </div>
            <div className="flex items-center space-x-4">
              {/* Auth Section */}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground">
                      <User className="h-4 w-4 mr-2" />
                      {user.user_metadata?.full_name || user.email}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => signOut()}>
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground">
                  <Link to="/auth">Sign In</Link>
                </Button>
              )}
              
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
