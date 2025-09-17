import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { useLanguage } from "@/contexts/LanguageContext";
import { Calendar, Users, Heart, Sparkles, MapPin, Clock, ArrowRight } from "lucide-react";

const Join2025 = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-earth to-sage bg-clip-text text-transparent mb-6">
            {t("Join COhere Boulder 2025", "Únete a COhere Boulder 2025")}
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            {t(
              "Be part of an ongoing community weaving process that's creating resilience through connection",
              "Sé parte de un proceso continuo de tejido comunitario que está creando resiliencia a través de la conexión"
            )}
          </p>
          <PhaseIndicator />
        </div>
      </section>

      {/* What's Emerging Section */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t("What's Emerging in 2025", "Lo que Está Emergiendo en 2025")}
          </h2>

          <div className="prose prose-lg mx-auto mb-12">
            <p className="text-muted-foreground">
              {t(
                "COhere Boulder is evolving from a one-time event into a living process. In 2025, we're launching our first full cycle of community weaving—a repeatable blueprint for building resilience that any community can adapt and implement.",
                "COhere Boulder está evolucionando de un evento único a un proceso vivo. En 2025, estamos lanzando nuestro primer ciclo completo de tejido comunitario: un modelo repetible para construir resiliencia que cualquier comunidad puede adaptar e implementar."
              )}
            </p>

            <p className="text-muted-foreground">
              {t(
                "This isn't just another conference or workshop series. It's a carefully designed journey that helps our community discover its own resilience patterns, strengthen existing connections, and create new pathways for collaboration.",
                "Esto no es solo otra conferencia o serie de talleres. Es un viaje cuidadosamente diseñado que ayuda a nuestra comunidad a descubrir sus propios patrones de resiliencia, fortalecer las conexiones existentes y crear nuevos caminos para la colaboración."
              )}
            </p>
          </div>

          {/* Three Phases Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <Card className="p-6 bg-gradient-to-br from-earth-light/30 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-8 w-8 text-earth" />
                <h3 className="text-xl font-semibold">
                  {t("Invitation", "Invitación")}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {t("September 24, 2025", "24 de Septiembre, 2025")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  "Core contributors gather to vision, commit resources, and shape the October experience",
                  "Los contribuyentes principales se reúnen para visualizar, comprometer recursos y dar forma a la experiencia de octubre"
                )}
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-sage-light/30 to-transparent border-sage/30 border-2">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="h-8 w-8 text-sage" />
                <h3 className="text-xl font-semibold">
                  {t("Invocation", "Invocación")}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {t("October 16, 2025", "16 de Octubre, 2025")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  "Community-wide launch! Ten days of events, connections, and collaborative experiences",
                  "¡Lanzamiento comunitario! Diez días de eventos, conexiones y experiencias colaborativas"
                )}
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-sunset-light/30 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <Heart className="h-8 w-8 text-sunset" />
                <h3 className="text-xl font-semibold">
                  {t("Integration", "Integración")}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {t("October 26, 2025", "26 de Octubre, 2025")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  "Reflection, harvest learnings, and commit to ongoing connections",
                  "Reflexión, cosecha de aprendizajes y compromiso con conexiones continuas"
                )}
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Ways to Participate */}
      <section className="py-16 px-4 bg-white/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t("Ways to Participate", "Formas de Participar")}
          </h2>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">🌱</span>
                {t("Join the October Experience", "Únete a la Experiencia de Octubre")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "The main community experience happens October 16-26. Participate in as many or as few events as you like. Some are drop-in, others require registration. All are designed to weave our community web stronger.",
                  "La experiencia comunitaria principal ocurre del 16 al 26 de octubre. Participa en tantos o tan pocos eventos como desees. Algunos son sin cita previa, otros requieren registro. Todos están diseñados para fortalecer nuestra red comunitaria."
                )}
              </p>
              <Link to="/calendar">
                <Button variant="outline" className="gap-2">
                  {t("View Calendar", "Ver Calendario")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">🤝</span>
                {t("Become a Core Contributor", "Conviértete en Contribuyente Principal")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "If you're ready to help shape and resource the COhere experience, consider joining as a core contributor. This involves attending the September 24 Invitation gathering and committing to support the October experience.",
                  "Si estás listo para ayudar a dar forma y recursos a la experiencia COhere, considera unirte como contribuyente principal. Esto implica asistir a la reunión de Invitación del 24 de septiembre y comprometerse a apoyar la experiencia de octubre."
                )}
              </p>
              <p className="text-sm text-muted-foreground italic">
                {t(
                  "Core contributor invitations are by nomination. Connect with current organizers to learn more.",
                  "Las invitaciones de contribuyentes principales son por nominación. Conecta con los organizadores actuales para aprender más."
                )}
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">✨</span>
                {t("Host or Co-Create an Event", "Organiza o Co-Crea un Evento")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "Have an idea for an experience that would strengthen our community web? We're looking for event hosts, facilitators, and co-creators who can offer workshops, gatherings, skill-shares, or other collaborative experiences during the October window.",
                  "¿Tienes una idea para una experiencia que fortalecería nuestra red comunitaria? Estamos buscando anfitriones de eventos, facilitadores y co-creadores que puedan ofrecer talleres, reuniones, intercambios de habilidades u otras experiencias colaborativas durante la ventana de octubre."
                )}
              </p>
              <Link to="/co-create">
                <Button variant="outline" className="gap-2">
                  {t("Learn About Co-Creating", "Aprende sobre Co-Crear")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">💫</span>
                {t("Stay Connected Year-Round", "Mantente Conectado Todo el Año")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "The COhere spirit doesn't end after October. Join our newsletter to stay connected with the community, receive updates about gatherings throughout the year, and be first to know about the 2026 cycle.",
                  "El espíritu COhere no termina después de octubre. Únete a nuestro boletín para mantenerte conectado con la comunidad, recibir actualizaciones sobre reuniones durante todo el año y ser el primero en saber sobre el ciclo 2026."
                )}
              </p>
              <Button className="gap-2">
                {t("Join Newsletter", "Únete al Boletín")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* The October Experience */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            {t("The October Experience", "La Experiencia de Octubre")}
          </h2>

          <div className="bg-gradient-to-br from-sage-light/20 to-earth-light/20 rounded-lg p-8 mb-8">
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-sage" />
                  {t("When", "Cuándo")}
                </h3>
                <p className="text-muted-foreground">
                  {t("October 16-26, 2025", "16-26 de Octubre, 2025")}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t(
                    "10 days of community experiences, with Invocation opening on the 16th and Integration closing on the 26th",
                    "10 días de experiencias comunitarias, con Invocación abriendo el 16 y la Integración cerrando el 26"
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-sage" />
                  {t("Where", "Dónde")}
                </h3>
                <p className="text-muted-foreground">
                  {t("Throughout Boulder, Colorado", "Por todo Boulder, Colorado")}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t(
                    "Events happen at various locations—parks, community centers, local businesses, and homes",
                    "Los eventos ocurren en varios lugares: parques, centros comunitarios, negocios locales y hogares"
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5 text-sage" />
                  {t("Who", "Quién")}
                </h3>
                <p className="text-muted-foreground">
                  {t(
                    "Open to all Boulder community members interested in building resilience through connection",
                    "Abierto a todos los miembros de la comunidad de Boulder interesados en construir resiliencia a través de la conexión"
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-sage" />
                  {t("Format", "Formato")}
                </h3>
                <p className="text-muted-foreground">
                  {t(
                    "Mix of scheduled events and emergent gatherings. Some free, some with suggested donations",
                    "Mezcla de eventos programados y reuniones emergentes. Algunos gratuitos, algunos con donaciones sugeridas"
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg text-muted-foreground mb-6">
              {t(
                "Ready to be part of something transformative?",
                "¿Listo para ser parte de algo transformador?"
              )}
            </p>
            <Link to="/calendar">
              <Button size="lg" className="bg-gradient-to-r from-sage to-earth hover:from-sage/90 hover:to-earth/90">
                {t("Explore October Events", "Explora Eventos de Octubre")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Join2025;
