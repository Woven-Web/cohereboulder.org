import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Users, Sprout, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

export const MissionSection = () => {
  return (
    <section className="py-20 bg-gradient-to-br from-earth-light/30 to-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mission Statement */}
        <div className="text-center space-y-8 mb-16">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-muted-foreground">
              We're at a pivotal point…
            </h2>

            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              With so much unfolding in the wider world, our local mission is to
            </p>

            <h3 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              <span className="text-primary">connect community</span> to create
              a <br />
              regenerative, resilient future.
            </h3>

            <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
              Together, let's celebrate the bright spots unfolding here in our
              community and weave them together to increase our resilience, our
              sense of place, & our felt sense of belonging.
            </p>
          </div>
        </div>

        {/* What is COhere */}
        <div className="mb-16">
          <h3 className="text-3xl font-bold text-center text-foreground mb-12">
            [CO]here is a…
          </h3>

          {/* Hex image placeholder */}
          <div className="text-center mb-12">
            <div className="bg-muted/30 rounded-2xl p-8 max-w-2xl mx-auto">
              <p className="text-muted-foreground italic">
                Hexagonal explanation graphic from original site
              </p>
            </div>
          </div>
        </div>

        {/* What does joining look like */}
        <div className="bg-card/50 rounded-2xl p-8 lg:p-12 border border-border">
          <h3 className="text-2xl font-bold text-foreground mb-8">
            What does joining this game look like?
          </h3>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    Attend events on our{" "}
                    <Link
                      to="/calendar"
                      className="text-primary hover:underline"
                    >
                      co-curated calendar
                    </Link>
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    Practice elements of shared{" "}
                    <a href="#" className="text-primary hover:underline">
                      gameplay
                    </a>{" "}
                    throughout your daily life
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    Step into a 'community activator' mindset
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    Put yourself and things you care about 'on the map'
                  </span>
                </li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-xl font-semibold text-foreground">
                This is for you if…
              </h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>
                  • You care about community and want to meet others who do too.
                </li>
                <li>• You have a gift and want to offer it.</li>
                <li>
                  • You're looking to collaborate or co-create with folks who
                  care about our future.
                </li>
                <li>• You are curious what Boulder has to offer.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
