import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Heart,
  Users,
  Sparkles,
  Calendar,
  ExternalLink,
  Globe,
  MessageCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

const Index = () => {
  const { tr } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero Section - Clear, Simple Vision */}
        <section className="min-h-[600px] flex items-center justify-center relative overflow-hidden bg-gradient-to-br from-earth-light via-background to-community-yellow/10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-5xl lg:text-7xl font-bold text-foreground mb-6">
              [CO]<span className="text-primary">here</span>
            </h1>
            <p className="text-2xl lg:text-3xl text-foreground mb-8">
              {tr("hero.tagline")}
            </p>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-12">
              {tr("hero.description")}
            </p>

            {/* Main Event Container */}
            <Card className="max-w-xl mx-auto shadow-warm bg-white/95">
              <CardContent className="p-8">
                <h2 className="text-xl font-semibold mb-4">
                  {tr("hero.mainEvent")}
                </h2>
                <p className="text-3xl font-bold text-primary mb-2">
                  {tr("hero.dates")}
                </p>
                <p className="text-muted-foreground mb-6">
                  {tr("hero.tenDayContainer")}
                </p>
                <Link to="/register">
                  <Button variant="community" size="lg">
                    {tr("hero.registerHere")}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* What is COhere - Simple and Clear */}
        <section className="py-20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("whatIs.title")}
            </h2>

            <div className="prose prose-lg max-w-none space-y-6 text-muted-foreground">
              <p className="text-xl text-center">{tr("whatIs.p1")}</p>

              <p>{tr("whatIs.p2")}</p>

              <p>{tr("whatIs.p3")}</p>
            </div>
          </div>
        </section>

        {/* 2024 Recap Video */}
        <section className="py-20 bg-gradient-to-br from-earth-light/30 to-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-8">
              {tr("recap2024.title")}
            </h2>
            <p className="text-xl text-center text-muted-foreground mb-8">
              {tr("recap2024.description")}
            </p>

            {/* YouTube Video Embed */}
            <div className="max-w-3xl mx-auto">
              <div className="aspect-video rounded-lg overflow-hidden shadow-warm">
                <iframe
                  src="https://www.youtube.com/embed/wMDpVsSGY5M"
                  title={tr("recap2024.videoTitle")}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>

            <p className="text-center text-muted-foreground mt-6">
              {tr("recap2024.summary")}
            </p>
          </div>
        </section>

        {/* COhere Themes */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">
              Our Themes
            </h2>
            <p className="text-xl text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
              COhere events explore six interconnected themes that weave
              together to create a resilient community
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🌱</div>
                  <h3 className="text-lg font-semibold mb-2">
                    Ecology & Food Systems
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Exploring regenerative agriculture, local food networks, and
                    our relationship with the land
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🎨</div>
                  <h3 className="text-lg font-semibold mb-2">Arts & Culture</h3>
                  <p className="text-sm text-muted-foreground">
                    Celebrating creativity, music, storytelling, and cultural
                    expression in all its forms
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">💚</div>
                  <h3 className="text-lg font-semibold mb-2">Wellness</h3>
                  <p className="text-sm text-muted-foreground">
                    Supporting physical, mental, and spiritual health through
                    community practices
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">💡</div>
                  <h3 className="text-lg font-semibold mb-2">
                    Technology & Innovation
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Harnessing innovation for social good and environmental
                    sustainability
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🏛️</div>
                  <h3 className="text-lg font-semibold mb-2">
                    Governance & Business
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Reimagining economic systems and decision-making for
                    collective benefit
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🏘️</div>
                  <h3 className="text-lg font-semibold mb-2">
                    Villaging & Neighboring
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Building strong neighborhoods and mutual support networks
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* The Rhythm - Focus on Invocation and Integration */}
        <section className="py-20 bg-gradient-to-br from-earth-light/30 to-transparent">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">
              {tr("rhythm.title")}
            </h2>
            <p className="text-xl text-muted-foreground text-center mb-12 max-w-3xl mx-auto">
              {tr("rhythm.subtitle")}
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Invocation Card */}
              <Card className="border-2 border-community-orange/30 hover:border-community-orange/60 transition-all shadow-warm">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-5xl font-bold text-community-orange">
                      ↗
                    </div>
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-2xl">
                    {tr("rhythm.invocation.title")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground font-normal">
                    {tr("rhythm.invocation.date")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    {tr("rhythm.invocation.description")}
                  </p>
                  <div className="space-y-2">
                    <p className="font-semibold text-sm">
                      {tr("rhythm.invocation.whatHappens")}
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• {tr("rhythm.invocation.points.p1")}</li>
                      <li>• {tr("rhythm.invocation.points.p2")}</li>
                      <li>• {tr("rhythm.invocation.points.p3")}</li>
                      <li>• {tr("rhythm.invocation.points.p4")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* Integration Card */}
              <Card className="border-2 border-sunset/30 hover:border-sunset/60 transition-all shadow-warm">
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-5xl font-bold text-sunset">⟲</div>
                    <Heart className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-2xl">
                    {tr("rhythm.integration.title")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground font-normal">
                    {tr("rhythm.integration.date")}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-muted-foreground">
                    {tr("rhythm.integration.description")}
                  </p>
                  <div className="space-y-2">
                    <p className="font-semibold text-sm">
                      {tr("rhythm.integration.whatHappens")}
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• {tr("rhythm.integration.points.p1")}</li>
                      <li>• {tr("rhythm.integration.points.p2")}</li>
                      <li>• {tr("rhythm.integration.points.p3")}</li>
                      <li>• {tr("rhythm.integration.points.p4")}</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* The 10 Days */}
            <div className="mt-12 text-center max-w-3xl mx-auto">
              <h3 className="text-2xl font-bold mb-4">
                {tr("rhythm.tenDays.title")}
              </h3>
              <p className="text-muted-foreground">
                {tr("rhythm.tenDays.description")}
              </p>
            </div>
          </div>
        </section>

        {/* The Spirit of COhere */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("spirit.title")}
            </h2>

            <div className="grid md:grid-cols-3 gap-8 mb-12">
              <Card className="text-center hover:shadow-warm transition-shadow">
                <CardContent className="pt-8">
                  <Users className="h-12 w-12 mx-auto mb-4 text-community-orange" />
                  <h3 className="text-xl font-semibold mb-2">
                    {tr("spirit.participation.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {tr("spirit.participation.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center hover:shadow-warm transition-shadow">
                <CardContent className="pt-8">
                  <Heart className="h-12 w-12 mx-auto mb-4 text-sunset" />
                  <h3 className="text-xl font-semibold mb-2">
                    {tr("spirit.interdependence.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {tr("spirit.interdependence.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="text-center hover:shadow-warm transition-shadow">
                <CardContent className="pt-8">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-nature-green" />
                  <h3 className="text-xl font-semibold mb-2">
                    {tr("spirit.abundance.title")}
                  </h3>
                  <p className="text-muted-foreground">
                    {tr("spirit.abundance.description")}
                  </p>
                </CardContent>
              </Card>
            </div>

            <p className="text-lg text-center text-muted-foreground italic max-w-3xl mx-auto">
              {tr("spirit.quote")}
            </p>
          </div>
        </section>

        {/* Boulder's Regenerative Ecosystem */}
        <section className="py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("ecosystem.title")}
            </h2>

            {/* PDF Embed */}
            <div className="bg-white rounded-lg shadow-warm p-4 mb-8">
              <iframe
                src={`${import.meta.env.BASE_URL}Ecosystem.pdf`}
                className="w-full h-[600px] rounded"
                title="Boulder Regenerative Ecosystem Map"
              />
            </div>

            <div className="text-center">
              <p className="text-muted-foreground mb-8 max-w-3xl mx-auto">
                {tr("ecosystem.description")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="outline" size="lg">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr("ecosystem.exploreMap")}
                </Button>
                <Button variant="outline" size="lg">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr("ecosystem.addProject")}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Join the Weaving */}
        <section className="py-20 bg-gradient-to-br from-community-yellow/20 to-transparent">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("join.title")}
            </h2>

            <div className="prose prose-lg mx-auto mb-12">
              <p className="text-muted-foreground">{tr("join.p1")}</p>
              <p className="text-muted-foreground">{tr("join.p2")}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" variant="community">
                <MessageCircle className="mr-2 h-5 w-5" />
                {tr("join.telegram")}
              </Button>
              <Button size="lg" variant="outline">
                {tr("join.newsletter")}
              </Button>
            </div>
          </div>
        </section>

        {/* Blueprint */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("blueprint.title")}
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              {tr("blueprint.p1")}
            </p>
            <p className="text-lg text-muted-foreground mb-12">
              {tr("blueprint.p2")}
            </p>
            <Link to="/about">
              <Button size="lg" variant="earth">
                {tr("blueprint.learnMore")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
