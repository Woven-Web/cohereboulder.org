import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getTranslation } from "@/lib/translations";

export function SuggestAdditionForm() {
  const { language } = useLanguage();
  const tr = (key: string) => getTranslation(key, language);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    organizationName: "",
    contactName: "",
    email: "",
    website: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Here you would normally send the data to your backend
      // For now, we'll just show a success message
      console.log("Suggestion submitted:", formData);

      toast({
        title: language === "es" ? "¡Gracias!" : "Thank you!",
        description: language === "es"
          ? "Tu sugerencia ha sido recibida. La revisaremos pronto."
          : "Your suggestion has been received. We'll review it soon.",
      });

      // Reset form and close dialog
      setFormData({
        organizationName: "",
        contactName: "",
        email: "",
        website: "",
        description: "",
      });
      setOpen(false);
    } catch (error) {
      toast({
        title: language === "es" ? "Error" : "Error",
        description: language === "es"
          ? "Hubo un problema al enviar tu sugerencia. Por favor, intenta de nuevo."
          : "There was a problem submitting your suggestion. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <ExternalLink className="mr-2 h-4 w-4" />
          {tr("ecosystem.suggestAdditions")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {language === "es" ? "Sugerir Adiciones al Mapa" : "Suggest Additions to the Map"}
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
              {language === "es" ? "Nombre de la Organización/Proyecto" : "Organization/Project Name"}
            </Label>
            <Input
              id="organizationName"
              required
              value={formData.organizationName}
              onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
              placeholder={language === "es" ? "ej. Boulder Food Rescue" : "e.g., Boulder Food Rescue"}
            />
          </div>

          <div>
            <Label htmlFor="contactName">
              {language === "es" ? "Tu Nombre" : "Your Name"}
            </Label>
            <Input
              id="contactName"
              required
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="email">
              {language === "es" ? "Tu Correo Electrónico" : "Your Email"}
            </Label>
            <Input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="website">
              {language === "es" ? "Sitio Web (opcional)" : "Website (optional)"}
            </Label>
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder={language === "es"
                ? "Cuéntanos sobre su trabajo regenerativo y conexión con la comunidad de Boulder..."
                : "Tell us about their regenerative work and connection to the Boulder community..."
              }
              rows={4}
            />
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {language === "es" ? "Cancelar" : "Cancel"}
            </Button>
            <Button type="submit">
              {language === "es" ? "Enviar Sugerencia" : "Submit Suggestion"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
