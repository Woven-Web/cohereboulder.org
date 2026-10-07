import { AppTabs } from "@/components/AppTabs";
import { useRegenosSession, useSiteConfig } from "@/hooks/useRegenos";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { AccountControl } from "@/components/AccountControl";

export const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language, toggleLanguage, tr } = useLanguage();
  const location = useLocation();
  const { data: config } = useSiteConfig();
  const { data: session } = useRegenosSession(config?.regenosLoginEnabled === true);
  const signedIn = Boolean(session?.did);

  const navItems = [
    { href: "/calendar", label: tr("nav.calendar") },
    { href: "/co-create", label: tr("nav.participate") },
    { href: "/archive", label: tr("nav.archive") },
  ];

  return (
    <>
      {/* Main Navigation */}
      <nav className="[&_button]:min-h-11 [&_button]:min-w-11 bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1 md:gap-4 h-16">
            {/* Logo */}
            <Link to="/" aria-label="[CO]here" className="flex shrink-0 min-h-11 items-center space-x-1 md:space-x-3">
              <span className="block h-10 w-12 overflow-hidden" aria-hidden="true">
                <img
                  src={`${import.meta.env.BASE_URL}COHERE-Logo-Branding-2.webp`}
                  alt="[CO]here Logo"
                  className="w-12 max-w-none"
                />
              </span>
              <span data-testid="header-wordmark" className="text-sm md:text-xl font-bold text-brand-deep">
                [CO]here
              </span>
            </Link>

            {/* Desktop Navigation */}
            <AppTabs />
            <div className="ml-auto flex items-center gap-1 md:gap-4">
              {[{ href: "/home", label: tr("nav.about") }].map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`hidden lg:flex min-h-11 items-center transition-colors duration-300 font-medium ${
                    location.pathname === item.href
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              {/* Register - the primary action for anyone new */}
              <Button asChild variant={signedIn ? "outline" : "community"} size="sm" className="hidden lg:inline-flex min-h-11">
                <Link to="/register">{tr(signedIn ? "app.registerGathering" : "nav.register")}</Link>
              </Button>

              {/* Sign in / account (regenOS) — only when the lane is on */}
              <AccountControl variant="desktop" />

              {/* Language Toggle */}
              <Button
                variant="ghost"
                onClick={toggleLanguage}
                className="min-h-11 min-w-11 rounded-full px-3 flex items-center gap-1"
              >
                <Globe className="h-4 w-4" />
                <span className="text-sm font-medium">{language === "en" ? "En/Es" : "Es/En"}</span>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="h-11 w-11 rounded-full"
                aria-label={tr(isMenuOpen ? "nav.closeMenu" : "nav.openMenu")}
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="lg:hidden bg-background border-t border-border">
              <div className="px-2 pt-2 pb-3 space-y-1">
                {(signedIn ? [{ href: "/home", label: tr("nav.about") }] : navItems).map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`flex min-h-11 items-center px-3 py-2 transition-colors duration-300 font-medium ${
                      location.pathname === item.href
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                
                {/* Register - Mobile */}
                <Button asChild variant={signedIn ? "outline" : "community"} className="min-h-11 mx-3 mt-2">
                  <Link to="/register" onClick={() => setIsMenuOpen(false)}>
                    {tr(signedIn ? "app.registerGathering" : "nav.register")}
                  </Link>
                </Button>

                <div className="flex flex-col">
                  <AccountControl variant="mobile" onNavigate={() => setIsMenuOpen(false)} />
                </div>
              </div>
            </div>
          )}
        </div>
      </nav>
      <AppTabs bottom />
    </>
  );
};
