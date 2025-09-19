import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { PhaseIndicator } from "@/components/PhaseIndicator";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Calendar,
  Users,
  Heart,
  Sparkles,
  MapPin,
  Clock,
  ArrowRight,
} from "lucide-react";

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
              "Sé parte de un proceso continuo de tejido comunitario que está creando resiliencia a través de la conexión",
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
                "COhere Boulder está evolucionando de un evento único a un proceso vivo. En 2025, estamos lanzando nuestro primer ciclo completo de tejido comunitario: un modelo repetible para construir resiliencia que cualquier comunidad puede adaptar e implementar.",
              )}
            </p>

            <p className="text-muted-foreground">
              {t(
                "This isn't just another conference or workshop series. It's a carefully designed journey that helps our community discover its own resilience patterns, strengthen existing connections, and create new pathways for collaboration.",
                "Esto no es solo otra conferencia o serie de talleres. Es un viaje cuidadosamente diseñado que ayuda a nuestra comunidad a descubrir sus propios patrones de resiliencia, fortalecer las conexiones existentes y crear nuevos caminos para la colaboración.",
              )}
            </p>
          </div>

          {/* Three Phases Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <Card className="p-6 bg-gradient-to-br from-earth-light/30 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <Users className="h-8 w-8 text-earth" />
                <h3 className="text-xl font-semibold">
                  {t("Invocation", "Invocación")}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {t("October 16, 2025", "16 de Octubre, 2025")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  "Opening ceremony to launch the community gathering period",
                  "Ceremonia de apertura para lanzar el período de reunión comunitaria",
                )}
              </p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-sage-light/30 to-transparent border-sage/30 border-2">
              <div className="flex items-center gap-3 mb-4">
                <Sparkles className="h-8 w-8 text-sage" />
                <h3 className="text-xl font-semibold">
                  {t("Cohering", "Cohesión")}
                </h3>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                {t("October 16-26, 2025", "16-26 de Octubre, 2025")}
              </p>
              <p className="text-muted-foreground">
                {t(
                  "Ten days of community events, connections, and collaborative experiences",
                  "Diez días de eventos comunitarios, conexiones y experiencias colaborativas",
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
                  "Reflexión, cosecha de aprendizajes y compromiso con conexiones continuas",
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
            {t("Ways to Co-Create", "Formas de Co-Crear")}
          </h2>

          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">🌱</span>
                {t("Join In - October 16-26", "Únete - 16-26 de Octubre")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "Experience Boulder's culture, community, and creativity during our 10-day container. From the opening Invocation on October 16th to the closing Integration on October 26th, participate in curated events designed to weave our community web stronger. Drop in to what calls to you!",
                  "Experimenta la cultura, comunidad y creatividad de Boulder durante nuestro contenedor de 10 días. Desde la Invocación de apertura el 16 de octubre hasta la Integración de cierre el 26 de octubre, participa en eventos curados diseñados para fortalecer nuestra red comunitaria. ¡Únete a lo que te llame!",
                )}
              </p>
              <Link to="/calendar">
                <Button variant="outline" className="gap-2">
                  {t("View October Events", "Ver Eventos de Octubre")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">🤝</span>
                {t("Co-Create With Us", "Co-Crea Con Nosotros")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "Share your vision and gifts in support of the community! Whether you want to host an event, organize partnerships, support outreach, or anchor a theme, we're looking for collaborators who want to invest in Boulder's cultural vitality.",
                  "¡Comparte tu visión y dones en apoyo a la comunidad! Ya sea que quieras organizar un evento, organizar asociaciones, apoyar el alcance o anclar un tema, estamos buscando colaboradores que quieran invertir en la vitalidad cultural de Boulder.",
                )}
              </p>
              <Link to="/co-create">
                <Button variant="outline" className="gap-2">
                  {t("Start Co-Creating", "Comenzar a Co-Crear")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </Card>

            <Card className="p-6">
              <h3 className="text-xl font-semibold mb-3 flex items-center gap-2">
                <span className="text-2xl">💫</span>
                {t("Sponsor COhere", "Patrocina COhere")}
              </h3>
              <p className="text-muted-foreground mb-4">
                {t(
                  "Invest in community by supporting culture, connection, and accessibility. Highlight your business as a cornerstone of the Boulder community.",
                  "Invierte en la comunidad apoyando la cultura, conexión y accesibilidad. Destaca tu negocio como una piedra angular de la comunidad de Boulder.",
                )}
              </p>
              <Link to="/co-create">
                <Button variant="outline" className="gap-2">
                  {t("Become a Sponsor", "Conviértete en Patrocinador")}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
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
                    "Invocation opens on the 16th, followed by 10 days of Cohering, closing with Integration on the 26th",
                    "Invocación abre el 16, seguida de 10 días de Cohesión, cerrando con Integración el 26",
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-sage" />
                  {t("Where", "Dónde")}
                </h3>
                <p className="text-muted-foreground">
                  {t(
                    "Throughout Boulder, Colorado",
                    "Por todo Boulder, Colorado",
                  )}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {t(
                    "Events happen at various locations—parks, community centers, local businesses, and homes",
                    "Los eventos ocurren en varios lugares: parques, centros comunitarios, negocios locales y hogares",
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
                    "Abierto a todos los miembros de la comunidad de Boulder interesados en construir resiliencia a través de la conexión",
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
                    "Mezcla de eventos programados y reuniones emergentes. Algunos gratuitos, algunos con donaciones sugeridas",
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-lg text-muted-foreground mb-6">
              {t(
                "Ready to be part of something transformative?",
                "¿Listo para ser parte de algo transformador?",
              )}
            </p>
            <Link to="/calendar">
              <Button
                size="lg"
                className="bg-gradient-to-r from-sage to-earth hover:from-sage/90 hover:to-earth/90"
              >
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
