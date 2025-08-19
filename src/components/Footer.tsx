import { Button } from "@/components/ui/button";
import { Calendar, Mail, MessageCircle, MapPin, ExternalLink } from "lucide-react";
import cohereLogoImage from "@/assets/cohere-logo.png";

export const Footer = () => {
  return (
    <footer className="bg-earth-warm text-primary-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <img 
                src={cohereLogoImage} 
                alt="[CO]here Logo" 
                className="h-10 w-10 brightness-0 invert"
              />
              <span className="text-2xl font-bold">[CO]here</span>
            </div>
            <p className="text-primary-foreground/80 leading-relaxed">
              A 10-day immersive game about people, place & cross-pollination across Boulder.
            </p>
            <div className="flex items-center space-x-2">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Boulder, Colorado</span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Connect</h3>
            <div className="space-y-3">
              <a href="#calendar" className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                <Calendar className="h-4 w-4" />
                <span>Event Calendar</span>
              </a>
              <a href="#" className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                <MessageCircle className="h-4 w-4" />
                <span>Telegram Community</span>
              </a>
              <a href="#" className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                <Mail className="h-4 w-4" />
                <span>Newsletter</span>
              </a>
            </div>
          </div>

          {/* Resources */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Resources</h3>
            <div className="space-y-3">
              <a href="#" className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                <ExternalLink className="h-4 w-4" />
                <span>Gameplay Instructions</span>
              </a>
              <a href="#" className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                <ExternalLink className="h-4 w-4" />
                <span>Regenerative Map</span>
              </a>
              <a href="#" className="flex items-center space-x-2 text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                <ExternalLink className="h-4 w-4" />
                <span>Web Map (Kumu)</span>
              </a>
            </div>
          </div>

          {/* Registration */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold">Join Us</h3>
            <div className="space-y-4">
              <Button 
                variant="secondary" 
                className="w-full bg-white/20 text-primary-foreground hover:bg-white/30 border-0"
              >
                2025 Registration
              </Button>
              <Button 
                variant="outline" 
                className="w-full border-white/30 text-primary-foreground hover:bg-white/10"
              >
                Registro en Español
              </Button>
            </div>
            <p className="text-xs text-primary-foreground/60">
              October 17-26th, 2025
            </p>
          </div>
        </div>

        <div className="border-t border-primary-foreground/20 mt-12 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-6 text-sm text-primary-foreground/60">
              <span>© 2024 [CO]here Boulder</span>
              <span>•</span>
              <span>A Woven Web Initiative</span>
            </div>
            <div className="flex items-center space-x-6 text-sm">
              <a href="#" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                English
              </a>
              <span className="text-primary-foreground/40">|</span>
              <a href="#" className="text-primary-foreground/80 hover:text-primary-foreground transition-colors">
                Español
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};