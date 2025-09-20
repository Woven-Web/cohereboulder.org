import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Users, Sprout, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export const MissionSection = () => {
  const { tr } = useLanguage();

  return (
    <section className="py-20 bg-gradient-to-br from-earth-light/30 to-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mission Statement */}
        <div className="text-center space-y-8 mb-16">
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-muted-foreground">
              {tr("mission.pivotalPoint")}
            </h2>

            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              {tr("mission.withSoMuch")}
            </p>

            <h3 className="text-4xl lg:text-5xl font-bold text-foreground leading-tight">
              <span className="text-primary">
                {tr("mission.connectCommunity")}
              </span>{" "}
              {tr("mission.toCreate")}
              <br />
              {tr("mission.regenerativeFuture")}
            </h3>

            <p className="text-xl text-muted-foreground max-w-4xl mx-auto">
              {tr("mission.togetherCelebrate")}
            </p>
          </div>
        </div>

        {/* What is COhere */}
        <div className="mb-16">
          <h3 className="text-3xl font-bold text-center text-foreground mb-12">
            {tr("mission.cohereIsA")}
          </h3>

          {/* Hex image placeholder */}
          <div className="text-center mb-12">
            <div className="bg-muted/30 rounded-2xl p-8 max-w-2xl mx-auto">
              <p className="text-muted-foreground italic">
                {tr("mission.hexGraphicPlaceholder")}
              </p>
            </div>
          </div>
        </div>

        {/* What does joining look like */}
        <div className="bg-card/50 rounded-2xl p-8 lg:p-12 border border-border">
          <h3 className="text-2xl font-bold text-foreground mb-8">
            {tr("mission.whatDoesJoining")}
          </h3>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <ul className="space-y-4">
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    {tr("mission.attendEvents")}{" "}
                    <Link
                      to="/calendar"
                      className="text-primary hover:underline"
                    >
                      {tr("mission.coCuratedCalendar")}
                    </Link>
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    {tr("mission.practiceElements")}{" "}
                    <a href="#" className="text-primary hover:underline">
                      {tr("mission.gameplay")}
                    </a>{" "}
                    {tr("mission.throughoutDaily")}
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    {tr("mission.stepInto")}
                  </span>
                </li>
                <li className="flex items-start space-x-3">
                  <span className="text-primary font-semibold">•</span>
                  <span className="text-muted-foreground">
                    {tr("mission.putYourself")}
                  </span>
                </li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-xl font-semibold text-foreground">
                {tr("mission.thisIsForYou")}
              </h4>
              <ul className="space-y-3 text-muted-foreground">
                <li>• {tr("mission.youCare")}</li>
                <li>• {tr("mission.youHaveGift")}</li>
                <li>• {tr("mission.youLooking")}</li>
                <li>• {tr("mission.youCurious")}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
