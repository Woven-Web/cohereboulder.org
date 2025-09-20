import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, DollarSign, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const SupportSection = () => {
  const { tr } = useLanguage();

  return (
    <section className="py-20 bg-gradient-to-br from-earth-light/20 to-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="overflow-hidden shadow-warm">
          <CardContent className="p-0">
            <div className="bg-gradient-community p-8 lg:p-12 text-center">
              <div className="w-20 h-20 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-6 animate-pulse-soft">
                <Heart className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                {tr("support.title")}
              </h2>
              <p className="text-xl text-white/90 max-w-2xl mx-auto">
                {tr("support.madeItFree")}
              </p>
            </div>

            <div className="p-8 lg:p-12 space-y-8">
              <div className="space-y-6 text-center">
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  {tr("support.fundedBy")}
                </p>

                <p className="text-sm text-muted-foreground font-medium">
                  {tr("support.considerDonation")}
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                <Button
                  variant="nature"
                  size="lg"
                  className="text-lg px-8 py-6"
                >
                  <DollarSign className="mr-2 h-5 w-5" />
                  {tr("support.venmo")}
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  className="text-lg px-8 py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <DollarSign className="mr-2 h-5 w-5" />
                  {tr("support.paypal")}
                </Button>
              </div>

              <div className="bg-earth-light/30 p-6 rounded-xl border border-border text-center">
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">
                    {tr("support.communityImpact")}
                  </h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  {tr("support.yourSupport")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
