import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, Heart, Network, Anchor, Gift, Star } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const ValuesSection = () => {
  const { tr } = useLanguage();

  const values = [
    {
      number: "01",
      titleKey: "values.activeParticipation.title",
      descriptionKey: "values.activeParticipation.description",
      icon: Lightbulb,
      color: "community",
    },
    {
      number: "02",
      titleKey: "values.careForCollective.title",
      descriptionKey: "values.careForCollective.description",
      icon: Heart,
      color: "nature",
    },
    {
      number: "03",
      titleKey: "values.radicalInterdependence.title",
      descriptionKey: "values.radicalInterdependence.description",
      icon: Network,
      color: "earth",
    },
    {
      number: "04",
      titleKey: "values.fromRoots.title",
      descriptionKey: "values.fromRoots.description",
      icon: Anchor,
      color: "community",
      ps: true,
    },
    {
      number: "05",
      titleKey: "values.anchorAbundance.title",
      descriptionKey: "values.anchorAbundance.description",
      icon: Gift,
      color: "nature",
    },
    {
      number: "06",
      titleKey: "values.amplifyGood.title",
      descriptionKey: "values.amplifyGood.description",
      icon: Star,
      color: "earth",
    },
  ];

  const getGradientClass = (color: string) => {
    switch (color) {
      case "community":
        return "bg-gradient-community";
      case "nature":
        return "bg-gradient-nature";
      case "earth":
        return "bg-gradient-earth";
      default:
        return "bg-gradient-community";
    }
  };

  return (
    <section className="py-20 bg-gradient-to-b from-background to-earth-light/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-6 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-foreground">
            {tr("values.title")}
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            {tr("values.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {values.map((value, index) => (
            <Card
              key={value.number}
              className="group hover:shadow-warm transition-all duration-500 hover:scale-105 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold text-muted-foreground/30">
                    {value.number}
                  </span>
                  <div
                    className={`w-12 h-12 rounded-full ${getGradientClass(value.color)} flex items-center justify-center group-hover:animate-pulse-soft`}
                  >
                    <value.icon className="h-6 w-6 text-white" />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-foreground leading-tight">
                    {tr(value.titleKey)}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {tr(value.descriptionKey)}
                  </p>
                </div>

                {value.ps && (
                  <div className="mt-4 p-4 bg-accent/20 rounded-lg border-l-4 border-primary">
                    <p className="text-sm text-muted-foreground italic">
                      {tr("values.fromRoots.ps")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
