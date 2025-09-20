import { Link } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Heart, Users, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const About = () => {
  const { tr } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section */}
        <section className="py-20 bg-gradient-to-br from-earth-light to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6">
              {tr("about.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {tr("about.subtitle")}
            </p>
          </div>
        </section>

        {/* The Three Phases */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("about.threePhaseRhythm")}
            </h2>

            <div className="space-y-8">
              <Card className="shadow-warm">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-nature-teal/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-nature-teal">
                        1
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">
                        {tr("about.invitation.title")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {tr("about.invitation.subtitle")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    {tr("about.invitation.description")}
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">
                      {tr("about.invitation.whatHappens")}
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• {tr("about.invitation.points.p1")}</li>
                      <li>• {tr("about.invitation.points.p2")}</li>
                      <li>• {tr("about.invitation.points.p3")}</li>
                      <li>• {tr("about.invitation.points.p4")}</li>
                    </ul>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 italic">
                    {tr("about.invitation.note")}
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-warm">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-community-orange/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-community-orange">
                        2
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">
                        {tr("about.invocation.title")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {tr("about.invocation.subtitle")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    {tr("about.invocation.description")}
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">
                      {tr("about.invocation.whatHappens")}
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• {tr("about.invocation.points.p1")}</li>
                      <li>• {tr("about.invocation.points.p2")}</li>
                      <li>• {tr("about.invocation.points.p3")}</li>
                      <li>• {tr("about.invocation.points.p4")}</li>
                      <li>• {tr("about.invocation.points.p5")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-warm">
                <CardHeader>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-nature-green/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-nature-green">
                        3
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">
                        {tr("about.integration.title")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {tr("about.integration.subtitle")}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">
                    {tr("about.integration.description")}
                  </p>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">
                      {tr("about.integration.whatHappens")}
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                      <li>• {tr("about.integration.points.p1")}</li>
                      <li>• {tr("about.integration.points.p2")}</li>
                      <li>• {tr("about.integration.points.p3")}</li>
                      <li>• {tr("about.integration.points.p4")}</li>
                      <li>• {tr("about.integration.points.p5")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="mt-12 p-6 bg-muted/30 rounded-xl text-center">
              <p className="text-lg text-muted-foreground italic">
                "{tr("about.journeyQuote")}"
              </p>
            </div>
          </div>
        </section>

        {/* Why This Works */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("about.whyThisWorks.title")}
            </h2>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="space-y-4">
                <h3 className="text-xl font-semibold">
                  {tr("about.whyThisWorks.naturalRhythm.title")}
                </h3>
                <p className="text-muted-foreground">
                  {tr("about.whyThisWorks.naturalRhythm.description")}
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">
                  {tr("about.whyThisWorks.distributedLeadership.title")}
                </h3>
                <p className="text-muted-foreground">
                  {tr("about.whyThisWorks.distributedLeadership.description")}
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">
                  {tr("about.whyThisWorks.crossPollination.title")}
                </h3>
                <p className="text-muted-foreground">
                  {tr("about.whyThisWorks.crossPollination.description")}
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-xl font-semibold">
                  {tr("about.whyThisWorks.ongoingProcess.title")}
                </h3>
                <p className="text-muted-foreground">
                  {tr("about.whyThisWorks.ongoingProcess.description")}
                </p>
              </div>
            </div>

            <Card className="shadow-warm bg-white">
              <CardContent className="p-8 text-center">
                <h3 className="text-xl font-semibold mb-4">
                  {tr("about.whyThisWorks.adaptable.title")}
                </h3>
                <p className="text-muted-foreground">
                  {tr("about.whyThisWorks.adaptable.description")}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Our Values */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("about.livingValues.title")}
            </h2>

            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Heart className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">
                      {tr("about.livingValues.activeParticipation.title")}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr("about.livingValues.activeParticipation.description")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Users className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">
                      {tr("about.livingValues.careForCollective.title")}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr("about.livingValues.careForCollective.description")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">
                      {tr("about.livingValues.radicalInterdependence.title")}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr(
                      "about.livingValues.radicalInterdependence.description",
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Heart className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">
                      {tr("about.livingValues.rootsToFruits.title")}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr("about.livingValues.rootsToFruits.description")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Users className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">
                      {tr("about.livingValues.anchorAbundance.title")}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr("about.livingValues.anchorAbundance.description")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Sparkles className="h-8 w-8 text-primary" />
                    <h3 className="font-semibold">
                      {tr("about.livingValues.amplifyGood.title")}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tr("about.livingValues.amplifyGood.description")}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Origins */}
        <section className="py-20 bg-gradient-to-br from-community-yellow/10 to-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("about.whereThisComesFrom.title")}
            </h2>

            <div className="prose prose-lg max-w-none text-muted-foreground space-y-6">
              <p>{tr("about.whereThisComesFrom.p1")}</p>

              <p>{tr("about.whereThisComesFrom.p2")}</p>

              <p>{tr("about.whereThisComesFrom.p3")}</p>

              <p>{tr("about.whereThisComesFrom.p4")}</p>
            </div>

            <div className="mt-12 text-center">
              <Link to="/join-2025">
                <Button variant="community" size="lg">
                  {tr("about.joinNextCycle")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
