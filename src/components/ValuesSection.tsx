import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb, Heart, Network, Anchor, Gift, Star } from "lucide-react";

export const ValuesSection = () => {
  const values = [
    {
      number: "01",
      title: "Active participation",
      description: "This game, much like life, becomes more fun when we are all leaning in, being courageously participatory and supporting one another.",
      icon: Lightbulb,
      color: "community"
    },
    {
      number: "02", 
      title: "Care for the collective",
      description: "Let's nurture our collective well-being, ensuring that everyone feels held, valued, and seen. Together, we thrive.",
      icon: Heart,
      color: "nature"
    },
    {
      number: "03",
      title: "Radical INTERdependence", 
      description: "Be bold with offers and requests. Let's find out what's possible when we lean on one another.",
      icon: Network,
      color: "earth"
    },
    {
      number: "04",
      title: "From the roots come the fruits",
      description: "We are capable of great things! But for these 10 days, let's focus on foundational relationships and shared context over outputs.",
      icon: Anchor,
      color: "community"
    },
    {
      number: "05", 
      title: "Anchor abundance",
      description: "Collectively, we are so resourced. Give generously, and trust that the rising tide will lift all ships. If you vision that would benefit from resources, see if other's in the community can contribute.",
      icon: Gift,
      color: "nature"
    },
    {
      number: "06",
      title: "Amplify what's good",
      description: "Celebrate and amplify the aspects of individuals, this place, and this community we love.",
      icon: Star,
      color: "earth"
    }
  ];

  const getGradientClass = (color: string) => {
    switch (color) {
      case 'community': return 'bg-gradient-community';
      case 'nature': return 'bg-gradient-nature';
      case 'earth': return 'bg-gradient-earth';
      default: return 'bg-gradient-community';
    }
  };

  return (
    <section className="py-20 bg-gradient-to-b from-background to-earth-light/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center space-y-6 mb-16">
          <h2 className="text-4xl lg:text-5xl font-bold text-foreground">
            Our <span className="text-primary">Norms and Values</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            The principles that guide our community game and create a foundation for meaningful connection.
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
                  <div className={`w-12 h-12 rounded-full ${getGradientClass(value.color)} flex items-center justify-center group-hover:animate-pulse-soft`}>
                    <value.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-foreground leading-tight">
                    {value.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {value.description}
                  </p>
                </div>
                
                {value.number === "04" && (
                  <div className="mt-4 p-4 bg-accent/20 rounded-lg border-l-4 border-primary">
                    <p className="text-sm text-muted-foreground italic">
                      P.S. There's no end to this game and we're stoked for the fruits to come!
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