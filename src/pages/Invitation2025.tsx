import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Calendar,
  Users,
  Heart,
  Sparkles,
  ArrowRight,
  Star,
  Leaf,
  Mountain,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const Invitation2025 = () => {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-earth-light/30 via-sage-light/20 to-background">
      <Navigation />
      <main>
        {/* Personal Invitation Hero */}
        <section className="py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-sage-light/30 via-transparent to-earth-light/30" />
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <div className="mb-8">
              <Star className="h-12 w-12 mx-auto text-sage animate-float" />
            </div>

            <p className="text-lg text-muted-foreground mb-4 font-serif italic">
              {t("Dear Community Weaver,", "Querido/a Tejedor/a de Comunidad,")}
            </p>

            <h1 className="text-4xl lg:text-5xl font-bold mb-6 bg-gradient-to-r from-earth to-sage bg-clip-text text-transparent">
              {t(
                "You've Been Personally Invited",
                "Has Sido Invitado/a Personalmente",
              )}
            </h1>

            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto leading-relaxed">
              {t(
                "Someone in our community sees your unique gifts and believes you have something essential to contribute to COhere Boulder's evolution. This invitation is specifically for you.",
                "Alguien en nuestra comunidad ve tus dones únicos y cree que tienes algo esencial que contribuir a la evolución de COhere Boulder. Esta invitación es específicamente para ti.",
              )}
            </p>

            <Card className="bg-white/80 backdrop-blur-sm shadow-warm max-w-md mx-auto mb-8">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground mb-2">
                  {t(
                    "Core Contributors Gathering",
                    "Reunión de Contribuyentes Principales",
                  )}
                </p>
                <p className="text-2xl font-bold text-primary mb-1">
                  {t("September 24, 2025", "24 de Septiembre, 2025")}
                </p>
                <p className="text-muted-foreground">
                  {t("6:00 PM - 9:00 PM", "6:00 PM - 9:00 PM")}
                </p>
              </CardContent>
            </Card>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                className="bg-gradient-to-r from-sage to-earth hover:from-sage/90 hover:to-earth/90 text-white"
                onClick={() =>
                  window.open("https://forms.gle/your-form-id", "_blank")
                }
              >
                {t("Accept This Invitation", "Acepta Esta Invitación")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </section>

        {/* Why You Section */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <Card className="bg-white shadow-soft">
              <CardHeader className="text-center">
                <Leaf className="h-8 w-8 mx-auto text-sage mb-4" />
                <CardTitle className="text-2xl">
                  {t("Why You?", "¿Por Qué Tú?")}
                </CardTitle>
              </CardHeader>
              <CardContent className="prose prose-lg max-w-none">
                <p className="text-muted-foreground leading-relaxed">
                  {t(
                    "You've been nominated as someone who embodies the spirit of COhere—someone who understands that resilience isn't built alone, but woven together. Whether through your work, your passion, or your presence in our community, you've shown a commitment to the kind of regenerative thinking Boulder needs.",
                    "Has sido nominado/a como alguien que encarna el espíritu de COhere: alguien que entiende que la resiliencia no se construye solo, sino que se teje en conjunto. Ya sea a través de tu trabajo, tu pasión o tu presencia en nuestra comunidad, has mostrado un compromiso con el tipo de pensamiento regenerativo que Boulder necesita.",
                  )}
                </p>

                <p className="text-muted-foreground leading-relaxed">
                  {t(
                    "As a core contributor, you'll help shape the October experience—not as an organizer of logistics, but as a vision holder and resource contributor. Your unique perspective, connections, and gifts are exactly what we need.",
                    "Como contribuyente principal, ayudarás a dar forma a la experiencia de octubre, no como organizador/a de logística, sino como portador/a de visión y contribuyente de recursos. Tu perspectiva única, conexiones y dones son exactamente lo que necesitamos.",
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* What We're Creating Together */}
        <section className="py-16 px-4 bg-sage-light/10">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              {t(
                "What We're Creating Together",
                "Lo Que Estamos Creando Juntos",
              )}
            </h2>

            <div className="grid md:grid-cols-3 gap-6 mb-12">
              <Card className="bg-gradient-to-br from-earth-light/50 to-white border-earth/20">
                <CardHeader>
                  <div className="h-12 w-12 rounded-full bg-earth/20 flex items-center justify-center mb-4">
                    <span className="text-2xl">🌱</span>
                  </div>
                  <CardTitle className="text-lg">
                    {t("Living Process", "Proceso Vivo")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "COhere is evolving from a one-time event to an ongoing rhythm. Your contribution helps establish this as a repeatable blueprint for community resilience.",
                      "COhere está evolucionando de un evento único a un ritmo continuo. Tu contribución ayuda a establecer esto como un modelo repetible para la resiliencia comunitaria.",
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-sage-light/50 to-white border-sage/20">
                <CardHeader>
                  <div className="h-12 w-12 rounded-full bg-sage/20 flex items-center justify-center mb-4">
                    <span className="text-2xl">🕸️</span>
                  </div>
                  <CardTitle className="text-lg">
                    {t("Community Web", "Red Comunitaria")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "Together we're strengthening the invisible connections that make Boulder resilient—relationships, resources, and reciprocity.",
                      "Juntos estamos fortaleciendo las conexiones invisibles que hacen a Boulder resiliente: relaciones, recursos y reciprocidad.",
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-sunset-light/50 to-white border-sunset/20">
                <CardHeader>
                  <div className="h-12 w-12 rounded-full bg-sunset/20 flex items-center justify-center mb-4">
                    <span className="text-2xl">✨</span>
                  </div>
                  <CardTitle className="text-lg">
                    {t("Emergent Magic", "Magia Emergente")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "When the right people gather with clear intention, something greater emerges. We're creating space for that emergence.",
                      "Cuando las personas correctas se reúnen con intención clara, algo mayor emerge. Estamos creando espacio para esa emergencia.",
                    )}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* The Invitation Gathering Details */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">
              {t("The Invitation Gathering", "La Reunión de Invitación")}
            </h2>

            <Card className="shadow-warm bg-white mb-8">
              <CardContent className="p-8">
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <Calendar className="h-6 w-6 text-sage mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">
                        {t("When", "Cuándo")}
                      </p>
                      <p className="text-muted-foreground">
                        {t(
                          "Wednesday, September 24, 2025, 6:00 PM - 9:00 PM",
                          "Miércoles, 24 de Septiembre, 2025, 6:00 PM - 9:00 PM",
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t(
                          "A shared meal will be provided",
                          "Se proporcionará una comida compartida",
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Mountain className="h-6 w-6 text-sage mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">
                        {t("Where", "Dónde")}
                      </p>
                      <p className="text-muted-foreground">
                        {t(
                          "Location will be shared upon RSVP",
                          "La ubicación se compartirá al confirmar asistencia",
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t(
                          "A beautiful space in Boulder that reflects our values",
                          "Un hermoso espacio en Boulder que refleja nuestros valores",
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Heart className="h-6 w-6 text-sage mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">
                        {t("What to Expect", "Qué Esperar")}
                      </p>
                      <ul className="text-muted-foreground space-y-1">
                        <li>
                          •{" "}
                          {t(
                            "Deep listening and visioning together",
                            "Escucha profunda y visión conjunta",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "Sharing what you can offer to the October experience",
                            "Compartir lo que puedes ofrecer a la experiencia de octubre",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "Connecting with fellow core contributors",
                            "Conectar con otros contribuyentes principales",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "Committing to specific contributions",
                            "Comprometerte con contribuciones específicas",
                          )}
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Sparkles className="h-6 w-6 text-sage mt-1 flex-shrink-0" />
                    <div>
                      <p className="font-semibold mb-1">
                        {t("What to Bring", "Qué Traer")}
                      </p>
                      <ul className="text-muted-foreground space-y-1">
                        <li>
                          •{" "}
                          {t(
                            "Your vision for a resilient Boulder",
                            "Tu visión para un Boulder resiliente",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "Ideas for events, connections, or resources",
                            "Ideas para eventos, conexiones o recursos",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "An open heart and mind",
                            "Un corazón y mente abiertos",
                          )}
                        </li>
                        <li>
                          • {t("Your authentic self", "Tu ser auténtico")}
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Commitment Section */}
            <Card className="bg-gradient-to-br from-earth-light/30 to-sage-light/30 border-sage/20 mb-8">
              <CardHeader className="text-center">
                <CardTitle className="text-xl">
                  {t("The Commitment", "El Compromiso")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center mb-6">
                  {t(
                    "As a core contributor, we ask that you:",
                    "Como contribuyente principal, te pedimos que:",
                  )}
                </p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-sage flex-shrink-0" />
                    <p className="text-sm">
                      {t(
                        "Attend the September 24 Invitation gathering",
                        "Asistas a la reunión de Invitación del 24 de septiembre",
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-sage flex-shrink-0" />
                    <p className="text-sm">
                      {t(
                        "Contribute something meaningful to the October experience (an event, connection, resource, or presence)",
                        "Contribuyas algo significativo a la experiencia de octubre (un evento, conexión, recurso o presencia)",
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-sage flex-shrink-0" />
                    <p className="text-sm">
                      {t(
                        "Participate in the October 26 Integration gathering",
                        "Participes en la reunión de Integración del 26 de octubre",
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-sage flex-shrink-0" />
                    <p className="text-sm">
                      {t(
                        "Hold the vision of a more resilient, connected Boulder",
                        "Mantengas la visión de un Boulder más resiliente y conectado",
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RSVP Section */}
            <div className="text-center bg-white rounded-lg shadow-soft p-8">
              <h3 className="text-2xl font-bold mb-4">
                {t("Ready to Accept?", "¿Listo/a para Aceptar?")}
              </h3>
              <p className="text-muted-foreground mb-6">
                {t(
                  "If this resonates with you, please RSVP by September 10th. Space is intentionally limited to maintain intimacy.",
                  "Si esto resuena contigo, por favor confirma tu asistencia antes del 10 de septiembre. El espacio está intencionalmente limitado para mantener la intimidad.",
                )}
              </p>

              <div className="space-y-4">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-sage to-earth hover:from-sage/90 hover:to-earth/90 text-white w-full sm:w-auto"
                  onClick={() =>
                    window.open("https://forms.gle/your-form-id", "_blank")
                  }
                >
                  {t("RSVP Now", "Confirma Ahora")}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>

                <p className="text-sm text-muted-foreground">
                  {t(
                    "Questions? Contact us at cohere@boulder.community",
                    "¿Preguntas? Contáctanos en cohere@boulder.community",
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Closing Note */}
        <section className="py-16 px-4 bg-gradient-to-b from-sage-light/10 to-transparent">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-lg text-muted-foreground italic">
              {t(
                '"The future is not some place we are going, but one we are creating. The paths are not to be found, but made. And the activity of making them changes both the maker and the destination."',
                '"El futuro no es un lugar al que vamos, sino uno que estamos creando. Los caminos no se encuentran, se hacen. Y la actividad de hacerlos cambia tanto al creador como al destino."',
              )}
            </p>
            <p className="text-sm text-muted-foreground mt-4">— John Schaar</p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Invitation2025;
