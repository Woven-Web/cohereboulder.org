import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, DollarSign, Users } from "lucide-react";

export const SupportSection = () => {
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
                Support our mission
              </h2>
              <p className="text-xl text-white/90 max-w-2xl mx-auto">
                We made [CO]here <strong>free</strong> because we believe everyone deserves to be 
                woven into a strong, resilient community.
              </p>
            </div>
            
            <div className="p-8 lg:p-12 space-y-8">
              <div className="space-y-6 text-center">
                <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                  [CO]here is funded by the individuals on the organizing team, and whatever donations we receive. 
                  If you believe in this mission and are able to support financially, your donation will help 
                  reimburse our expenses and support the people who have spent hundreds of hours bringing [CO]here to life!
                </p>
                
                <p className="text-sm text-muted-foreground font-medium">
                  Consider making a tax-deductible donation to our 501(c)(3) via:
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                <Button 
                  variant="nature" 
                  size="lg" 
                  className="text-lg px-8 py-6"
                >
                  <DollarSign className="mr-2 h-5 w-5" />
                  Venmo
                </Button>
                
                <Button 
                  variant="outline" 
                  size="lg" 
                  className="text-lg px-8 py-6 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <DollarSign className="mr-2 h-5 w-5" />
                  PayPal
                </Button>
              </div>

              <div className="bg-earth-light/30 p-6 rounded-xl border border-border text-center">
                <div className="flex items-center justify-center space-x-2 mb-3">
                  <Users className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-foreground">Community Impact</h3>
                </div>
                <p className="text-muted-foreground text-sm">
                  Your support helps us keep this experience accessible to everyone in our community, 
                  regardless of their financial situation. Together, we're building a more connected Boulder.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};