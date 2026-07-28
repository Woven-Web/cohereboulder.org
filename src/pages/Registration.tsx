import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { DynamicForm } from "@/components/DynamicForm";
import { useLanguage } from "@/contexts/LanguageContext";

const Registration = () => {
  const { tr, language } = useLanguage();
  const spanish = language === "es";

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto space-y-10">
          <div className="text-center space-y-4">
            <h1 className="text-4xl lg:text-5xl font-bold">{tr("hero.tagline")}</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              {spanish
                ? "Regístrate para recibir novedades y mantenerte al tanto de lo que se está tejiendo. Registrarse es gratis y todos los eventos son opcionales."
                : "Register to receive communications and stay up to date with what's unfolding. Registration is free and every event is opt-in."}
            </p>
            <p className="text-lg font-medium text-primary">{tr("hero.dates")}</p>
          </div>

          <DynamicForm
            slug="register-2026"
            successTitle={spanish ? "¡Estás dentro!" : "You're woven in!"}
            successMessage={
              spanish
                ? "Gracias por registrarte. Te escribiremos a medida que COhere 2026 tome forma, y podrás elegir tu propia aventura desde el calendario comunitario."
                : "Thanks for registering. We'll be in touch as COhere 2026 takes shape — and you'll be able to choose your own adventure from the community calendar."
            }
          />
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Registration;
