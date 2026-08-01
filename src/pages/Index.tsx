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
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { SuggestAdditionForm } from "@/components/SuggestAdditionForm";
import { EmailSignup } from "@/components/EmailSignup";
// Stills from the two Woven Web films — real gatherings, not stock imagery.
import gatheringPhoto from "@/assets/photos/gathering.webp";
import altarPhoto from "@/assets/photos/altar.webp";
import coCreatingPhoto from "@/assets/photos/co-creating.webp";
import singingCirclePhoto from "@/assets/photos/singing-circle.webp";
import sharedMealPhoto from "@/assets/photos/shared-meal.webp";
import celebrationPhoto from "@/assets/photos/celebration.webp";

const Index = () => {
  const { tr } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        {/* Hero - a real gathering behind the invitation */}
        <section className="relative min-h-[640px] flex items-center justify-center overflow-hidden">
          <img
            src={gatheringPhoto}
            alt="Community members gathering during COhere Boulder"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/25" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-canopy" aria-hidden="true" />

          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
            <h1 className="text-5xl lg:text-7xl font-bold text-white mb-6 drop-shadow-sm">
              [CO]<span className="text-community-yellow">here</span>
            </h1>
            <p className="text-2xl lg:text-3xl text-white/95 mb-6">
              {tr("hero.tagline")}
            </p>

            {/* This year's theme */}
            <div className="mb-10">
              <p className="text-xs uppercase tracking-[0.18em] text-white/70 mb-2">
                {tr("hero.themeLabel")}
              </p>
              <p className="text-3xl lg:text-4xl font-semibold text-community-yellow">
                {tr("hero.theme")}
              </p>
            </div>

            {/* Main Event Container */}
            <Card className="max-w-xl mx-auto shadow-warm bg-white/95 backdrop-blur-sm">
              <CardContent className="p-8">
                <h2 className="text-xl font-semibold mb-4">
                  {tr("hero.mainEvent")}
                </h2>
                <p className="text-3xl font-bold text-primary mb-2">
                  {tr("hero.dates")}
                </p>
                <p className="text-muted-foreground mb-2">
                  {tr("hero.tenDayContainer")}
                </p>
                <p className="text-muted-foreground mb-6">
                  {tr("hero.openingWeekend")}
                </p>
                <Button asChild size="lg" variant="community" className="w-full mb-5">
                  <Link to="/register">{tr("hero.registerHere")}</Link>
                </Button>
                <p className="text-sm text-muted-foreground mb-3">
                  {tr("signup.orJustEmail")}
                </p>
                <EmailSignup source="hero" />
              </CardContent>
            </Card>

            <p className="text-lg text-white/90 max-w-2xl mx-auto mt-10">
              {tr("hero.description")}
            </p>
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

        {/* This year's theme, stated over the land it comes from */}
        <section className="relative">
          <img
            src={altarPhoto}
            alt="An altar of feathers, fruit, stone and candlelight on a woven blanket"
            className="h-[380px] w-full object-cover lg:h-[460px]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-earth-warm/90 via-earth-warm/60 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8">
              <div className="max-w-md">
                <p className="text-xs uppercase tracking-[0.18em] text-community-yellow mb-3">
                  {tr("hero.themeLabel")}
                </p>
                <p className="text-4xl lg:text-5xl font-bold text-white leading-tight">
                  {tr("hero.theme")}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The Community Calendar - co-created, not programmed */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <img
                src={coCreatingPhoto}
                alt="People gathered around a table of printed event listings"
                className="rounded-lg shadow-warm w-full object-cover"
              />
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold mb-3">
                  {tr("communityCalendar.title")}
                </h2>
                <p className="text-xl text-primary font-medium mb-6">
                  {tr("communityCalendar.subtitle")}
                </p>
                <div className="space-y-4 text-muted-foreground text-lg mb-8">
                  <p>{tr("communityCalendar.p1")}</p>
                  <p>{tr("communityCalendar.p2")}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Link to="/calendar">
                    <Button size="lg" variant="community">
                      <Calendar className="mr-2 h-5 w-5" />
                      {tr("communityCalendar.explore")}
                    </Button>
                  </Link>
                  <Link to="/co-create">
                    <Button size="lg" variant="outline">
                      {tr("nav.participate")}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Choose your own adventure */}
        <section className="py-20 bg-gradient-to-br from-nature-moss/5 via-background to-community-yellow/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold mb-6">
                  {tr("chooseAdventure.title")}
                </h2>
                <p className="text-xl text-foreground mb-4">{tr("chooseAdventure.p1")}</p>
                <p className="text-lg text-muted-foreground">{tr("chooseAdventure.p2")}</p>
              </div>
              <img
                src={singingCirclePhoto}
                alt="People standing arm in arm, singing together from song sheets"
                className="rounded-lg shadow-warm w-full object-cover lg:order-last"
              />
            </div>

            {/* Three depths of involvement — pick the one that fits this year */}
            <div className="grid md:grid-cols-3 gap-6 mt-16">
              {[
                { key: "participate", accent: "border-t-nature-teal" },
                { key: "contribute", accent: "border-t-community-orange" },
                { key: "lead", accent: "border-t-sunset" },
              ].map(({ key, accent }) => (
                <Card key={key} className={`border-t-4 ${accent} shadow-warm bg-card`}>
                  <CardContent className="pt-6">
                    <h3 className="text-xl font-semibold mb-3">
                      {tr(`chooseAdventure.${key}.title`)}
                    </h3>
                    <p className="text-muted-foreground">
                      {tr(`chooseAdventure.${key}.description`)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* COhere Videos */}
        <section className="py-20 bg-gradient-to-br from-earth-light/30 to-transparent">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-8">
              {tr("videos.title")}
            </h2>
            <p className="text-xl text-center text-muted-foreground mb-8">
              {tr("videos.description")}
            </p>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <div className="aspect-video rounded-lg overflow-hidden shadow-warm">
                  <iframe
                    src="https://www.youtube.com/embed/lgDT45Te-lE"
                    title={tr("videos.filmTitle")}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="text-center text-muted-foreground mt-4 font-medium">
                  {tr("videos.filmTitle")}
                </p>
              </div>

              <div>
                <div className="aspect-video rounded-lg overflow-hidden shadow-warm">
                  <iframe
                    src="https://www.youtube.com/embed/wMDpVsSGY5M"
                    title={tr("videos.recap2024Title")}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="text-center text-muted-foreground mt-4 font-medium">
                  {tr("videos.recap2024Title")}
                </p>
              </div>
            </div>

            <p className="text-center text-muted-foreground mt-8 max-w-3xl mx-auto">
              {tr("videos.summary")}
            </p>
          </div>
        </section>

        {/* COhere Themes */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-4">
              {tr("themes.title")}
            </h2>
            <p className="text-xl text-center text-muted-foreground mb-12 max-w-3xl mx-auto">
              {tr("themes.subtitle")}
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🌱</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tr("themes.ecology.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tr("themes.ecology.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🎨</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tr("themes.arts.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tr("themes.arts.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">💚</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tr("themes.wellness.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tr("themes.wellness.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">💡</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tr("themes.technology.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tr("themes.technology.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🏛️</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tr("themes.economy.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tr("themes.economy.description")}
                  </p>
                </CardContent>
              </Card>

              <Card className="hover:shadow-warm transition-shadow">
                <CardContent className="pt-6">
                  <div className="text-3xl mb-3">🏘️</div>
                  <h3 className="text-lg font-semibold mb-2">
                    {tr("themes.community.title")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {tr("themes.community.description")}
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
              <Card className="border-2 border-community-orange/30 hover:border-community-orange/60 transition-all shadow-warm overflow-hidden">
                <img
                  src={sharedMealPhoto}
                  alt="Bowls of food laid out for a shared meal"
                  className="h-44 w-full object-cover"
                />
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
                  <p className="text-sm text-muted-foreground italic">
                    {tr("rhythm.invocation.detailsComingSoon")}
                  </p>
                </CardContent>
              </Card>

              {/* Integration Card */}
              <Card className="border-2 border-sunset/30 hover:border-sunset/60 transition-all shadow-warm overflow-hidden">
                <img
                  src={celebrationPhoto}
                  alt="A singer performing on stage under string lights"
                  className="h-44 w-full object-cover"
                />
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
                  <p className="text-sm text-muted-foreground italic">
                    {tr("rhythm.integration.detailsComingSoon")}
                  </p>
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
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() =>
                    window.open(
                      `${import.meta.env.BASE_URL}Ecosystem.pdf`,
                      "_blank",
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr("ecosystem.exploreMap")}
                </Button>
                <SuggestAdditionForm />
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

            <div className="prose prose-lg mx-auto">
              <p className="text-muted-foreground">{tr("join.p1")}</p>
              <p className="text-muted-foreground">{tr("join.p2")}</p>
            </div>
          </div>
        </section>

        {/* A rhythm other communities can grow */}
        <section className="py-20 bg-earth-light/20">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl lg:text-4xl font-bold text-center mb-12">
              {tr("rhythmForOthers.title")}
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              {tr("rhythmForOthers.p1")}
            </p>
            <p className="text-lg text-muted-foreground mb-12">
              {tr("rhythmForOthers.p2")}
            </p>
            <Link to="/about">
              <Button size="lg" variant="earth">
                {tr("rhythmForOthers.learnMore")}
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
