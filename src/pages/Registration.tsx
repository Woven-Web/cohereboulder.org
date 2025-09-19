import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { RegistrationForm } from "@/components/RegistrationForm";

const Registration = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <RegistrationForm />
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Registration;