import { Button } from "@/components/ui/button";
import { ArrowRight, Calendar, Globe } from "lucide-react";
import heroImage from "@/assets/hero-community.jpg";
import { useLanguage } from "@/contexts/LanguageContext";

export const HeroSection = () => {
  const { tr, language } = useLanguage();

  return (
    <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-earth-light to-background relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-20 w-32 h-32 rotate-12">
          <div className="w-full h-full border-2 border-nature-teal transform rotate-45"></div>
        </div>
        <div className="absolute bottom-20 right-20 w-24 h-24 rotate-45">
          <div className="w-full h-full border-2 border-community-orange transform rotate-45"></div>
        </div>
        <div className="absolute top-1/2 left-10 w-16 h-16 rotate-12">
          <div className="w-full h-full border-2 border-nature-green transform rotate-45"></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12 items-center">
        {/* Left Content */}
        <div className="space-y-8 animate-slide-up">
          <div className="space-y-6">
            <h1 className="text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              [CO]<span className="text-primary">here</span>
            </h1>

            <div className="space-y-4">
              <p className="text-xl lg:text-2xl text-muted-foreground font-light">
                {tr("heroSection.immersiveGame")}
              </p>

              {language === "en" && (
                <p className="text-lg text-muted-foreground italic">
                  Un juego inmersivo de 10 días sobre comunidad, tierra y
                  polinización cruzada.
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2 text-lg font-medium">
              <Calendar className="h-5 w-5 text-primary" />
              <span className="text-foreground">{tr("heroSection.dates")}</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button variant="community" size="lg" className="text-lg px-8 py-6">
              {tr("heroSection.registrationComing")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="text-lg px-8 py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
            >
              <Globe className="mr-2 h-5 w-5" />
              {tr("heroSection.registerSpanish")}
            </Button>
          </div>
        </div>

        {/* Right Image */}
        <div className="relative group">
          <div className="absolute -inset-4 bg-gradient-community rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-500"></div>
          <div className="relative">
            <img
              src={heroImage}
              alt={tr("heroSection.communityArt")}
              className="w-full h-auto rounded-2xl shadow-warm transform group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent rounded-2xl"></div>
          </div>
        </div>
      </div>

      {/* Floating Elements */}
      <div className="absolute top-1/4 right-1/4 w-3 h-3 bg-community-orange rounded-full animate-float"></div>
      <div
        className="absolute bottom-1/3 left-1/4 w-2 h-2 bg-nature-teal rounded-full animate-float"
        style={{ animationDelay: "1s" }}
      ></div>
      <div
        className="absolute top-3/4 right-1/3 w-4 h-4 bg-nature-green rounded-full animate-float"
        style={{ animationDelay: "2s" }}
      ></div>
    </section>
  );
};
