import { Navigation } from "@/components/Navigation";
import { HeroSection } from "@/components/HeroSection";
import { EcosystemMap } from "@/components/EcosystemMap";
import { MissionSection } from "@/components/MissionSection";
import { ValuesSection } from "@/components/ValuesSection";
import { SupportSection } from "@/components/SupportSection";
import { Footer } from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main>
        <HeroSection />
        <EcosystemMap />
        <MissionSection />
        <ValuesSection />
        <SupportSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
