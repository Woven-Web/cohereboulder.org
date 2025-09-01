import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Menu, X, Globe } from "lucide-react";
import cohereLogoImage from "@/assets/cohere-logo.png";

export const Navigation = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [language, setLanguage] = useState("en");
  const location = useLocation();

  const toggleLanguage = () => {
    setLanguage(prev => prev === "en" ? "es" : "en");
  };

  const navItems = [
    { href: "/about", label: language === "en" ? "Tell Me More" : "Cuéntame Más" },
    { href: "/co-create", label: language === "en" ? "Co-Create With Us" : "Co-Crear Con Nosotros" },
    { href: "/calendar", label: language === "en" ? "Calendar" : "Calendario" }
  ];

  return (
    <>
      {/* Announcement Bar */}
      <div className="bg-community-yellow text-foreground text-center py-2 px-4 text-sm">
        {language === "en" 
          ? "[CO]here has completed and continues! Subscribe to our newsletter to stay in the loop!" 
          : "¡[CO]here ha completado y continúa! ¡Suscríbete a nuestro boletín para mantenerte al tanto!"
        }
      </div>

      {/* Main Navigation */}
      <nav className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3">
              <img 
                src={cohereLogoImage} 
                alt="[CO]here Logo" 
                className="h-8 w-8"
              />
              <span className="text-xl font-bold text-foreground">[CO]here</span>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`transition-colors duration-300 font-medium ${
                    location.pathname === item.href 
                      ? "text-primary border-b-2 border-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              
              {/* Language Toggle */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLanguage}
                className="rounded-full"
              >
                <Globe className="h-4 w-4" />
                <span className="sr-only">Toggle language</span>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden flex items-center space-x-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleLanguage}
                className="rounded-full"
              >
                <Globe className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="rounded-full"
              >
                {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="md:hidden bg-background border-t border-border">
              <div className="px-2 pt-2 pb-3 space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={`block px-3 py-2 transition-colors duration-300 font-medium ${
                      location.pathname === item.href 
                        ? "text-primary bg-primary/10" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>
    </>
  );
};