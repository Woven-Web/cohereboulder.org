import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { InterestForm } from "@/components/InterestForm";

const GetInvolved = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl lg:text-5xl font-bold mb-6">
              Get Involved with COhere 2025
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Whether you want to organize, sponsor, host an event, or simply participate,
              we'd love to hear from you. Let us know how you'd like to be part of
              weaving Boulder's resilient community.
            </p>
          </div>

          <InterestForm />

          <div className="mt-12 text-center">
            <p className="text-muted-foreground">
              Have questions? Reach out to{" "}
              <a href="mailto:hello@cohereboulder.org" className="text-primary hover:underline">
                hello@cohereboulder.org
              </a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default GetInvolved;
