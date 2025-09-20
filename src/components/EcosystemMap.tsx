import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, MessageCircle, Map } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const EcosystemMap = () => {
  const { tr } = useLanguage();

  return (
    <section className="py-20 bg-gradient-to-b from-background to-earth-light/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Map PDF */}
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-nature rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity duration-500"></div>
            <Card className="relative overflow-hidden">
              <CardContent className="p-0">
                <iframe
                  src={`${import.meta.env.BASE_URL}Ecosystem.pdf`}
                  title={tr("ecosystem.title")}
                  className="w-full h-[500px] rounded-lg"
                  style={{ border: "none" }}
                />
              </CardContent>
            </Card>
          </div>

          {/* Right: Content */}
          <div className="space-y-8">
            <div className="space-y-6">
              <h2 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
                {tr("ecosystem.title")}
              </h2>

              <div className="space-y-4 text-lg text-muted-foreground">
                <p>{tr("ecosystem.description")}</p>

                <p>{tr("ecosystem.onlyTaste")}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="nature" size="lg" className="text-lg px-8 py-6">
                <Map className="mr-2 h-5 w-5" />
                {tr("ecosystem.exploreMap")}
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>

              <Button variant="outline" size="lg" className="text-lg px-8 py-6">
                <MessageCircle className="mr-2 h-5 w-5" />
                {tr("join.telegram")}
              </Button>
            </div>

            <div className="bg-card/50 p-6 rounded-xl border border-border">
              <h3 className="font-semibold text-foreground mb-3">
                {tr("ecosystem.whichParts")}
              </h3>
              <p className="text-muted-foreground italic">
                {tr("ecosystem.whatNotDiscovered")}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                {tr("ecosystem.encourageInterplay")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
