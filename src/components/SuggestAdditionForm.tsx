import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function SuggestAdditionForm() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);
  const { toast } = useToast();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "",
    website: "",
    description: "",
    contactName: "",
    contactEmail: "",
  });

  // Auto-fill form when user is logged in
  useEffect(() => {
    if (user && open) {
      setFormData(prev => ({
        ...prev,
        contactName: user.user_metadata?.full_name || "",
        contactEmail: user.email || "",
      }));
    }
  }, [user, open]);

  const handleFormOpen = () => {
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Basic validation
      if (!formData.organizationName || !formData.description) {
        throw new Error("Please fill in all required fields");
      }

      if (!formData.contactEmail && !user?.email) {
        throw new Error("Please provide a contact email");
      }

      const { error } = await supabase.from("map_suggestions").insert({
        user_id: user?.id || null,
        name: formData.organizationName,
        description: formData.description,
        category: "community",
        website: formData.website || null,
        contact_email: formData.contactEmail || user?.email || "",
      });

      if (error) throw error;

      toast({
        title: language === "es" ? "¡Gracias!" : "Thank you!",
        description:
          language === "es"
            ? "Tu sugerencia ha sido recibida. La revisaremos pronto."
            : "Your suggestion has been received. We'll review it soon.",
      });

      // Reset form and close dialog
      setFormData({
        organizationName: "",
        website: "",
        description: "",
        contactName: "",
        contactEmail: "",
      });
      setOpen(false);
    } catch (error) {
      console.error("Error submitting suggestion:", error);
      toast({
        title: language === "es" ? "Error" : "Error",
        description:
          error instanceof Error ? error.message :
          language === "es"
            ? "Hubo un problema al enviar tu sugerencia. Por favor, intenta de nuevo."
            : "There was a problem submitting your suggestion. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="lg" onClick={handleFormOpen}>
        <ExternalLink className="mr-2 h-4 w-4" />
        {tr("ecosystem.suggestAdditions")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {language === "es"
                ? "Sugerir Adiciones al Mapa"
                : "Suggest Additions to the Map"}
            </DialogTitle>
            <DialogDescription>
              {language === "es"
                ? "¿Conoces una organización, proyecto o espacio que debería estar en nuestro mapa del ecosistema regenerativo? Háganoslo saber."
                : "Know an organization, project, or space that belongs on our regenerative ecosystem map? Let us know."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div>
              <Label htmlFor="organizationName">
                {language === "es"
                  ? "Nombre de la Organización/Proyecto"
                  : "Organization/Project Name"}
              </Label>
              <Input
                id="organizationName"
                required
                value={formData.organizationName}
                onChange={(e) =>
                  setFormData({ ...formData, organizationName: e.target.value })
                }
                placeholder={
                  language === "es"
                    ? "ej. Boulder Food Rescue"
                    : "e.g., Boulder Food Rescue"
                }
              />
            </div>

            <div>
              <Label htmlFor="website">
                {language === "es"
                  ? "Sitio Web (opcional)"
                  : "Website (optional)"}
              </Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) =>
                  setFormData({ ...formData, website: e.target.value })
                }
                placeholder="https://"
              />
            </div>

            <div>
              <Label htmlFor="description">
                {language === "es"
                  ? "¿Por qué debería estar en el mapa?"
                  : "Why should it be on the map?"}
              </Label>
              <Textarea
                id="description"
                required
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder={
                  language === "es"
                    ? "Cuéntanos sobre su trabajo regenerativo y conexión con la comunidad de Boulder..."
                    : "Tell us about their regenerative work and connection to the Boulder community..."
                }
                rows={4}
              />
            </div>

            {/* Contact information */}
            <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium">
                {language === "es" ? "Información de Contacto" : "Contact Information"}
              </h3>
              
              <div>
                <Label htmlFor="contactName">
                  {language === "es" ? "Tu Nombre" : "Your Name"}
                </Label>
                <Input
                  id="contactName"
                  value={formData.contactName}
                  onChange={(e) =>
                    setFormData({ ...formData, contactName: e.target.value })
                  }
                  placeholder={
                    language === "es" ? "Nombre completo" : "Full name"
                  }
                />
              </div>

              <div>
                <Label htmlFor="contactEmail">
                  {language === "es" ? "Tu Email" : "Your Email"}
                  {!user && " *"}
                </Label>
                <Input
                  id="contactEmail"
                  type="email"
                  required={!user}
                  value={formData.contactEmail}
                  onChange={(e) =>
                    setFormData({ ...formData, contactEmail: e.target.value })
                  }
                  placeholder="tu@email.com"
                />
                {!user && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {language === "es"
                      ? "Necesitamos tu email para contactarte sobre tu sugerencia"
                      : "We need your email to contact you about your suggestion"}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {language === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {language === "es" ? "Enviar Sugerencia" : "Submit Suggestion"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}