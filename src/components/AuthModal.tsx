import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AuthModal({ open, onOpenChange, onSuccess }: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const { language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");

  const [signInData, setSignInData] = useState({
    email: "",
    password: "",
  });

  const [signUpData, setSignUpData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
  });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(signInData.email, signInData.password);

    if (error) {
      toast({
        title: language === "es" ? "Error de inicio de sesión" : "Sign in error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: language === "es" ? "¡Bienvenido!" : "Welcome back!",
        description: language === "es"
          ? "Has iniciado sesión exitosamente."
          : "You have successfully signed in.",
      });
      onOpenChange(false);
      onSuccess?.();
    }

    setIsLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signUpData.password !== signUpData.confirmPassword) {
      toast({
        title: language === "es" ? "Error" : "Error",
        description: language === "es"
          ? "Las contraseñas no coinciden"
          : "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await signUp(
      signUpData.email,
      signUpData.password,
      signUpData.fullName
    );

    if (error) {
      toast({
        title: language === "es" ? "Error de registro" : "Sign up error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: language === "es" ? "¡Cuenta creada!" : "Account created!",
        description: language === "es"
          ? "Por favor revisa tu correo electrónico para verificar tu cuenta."
          : "Please check your email to verify your account.",
      });
      onOpenChange(false);
    }

    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {language === "es"
              ? "Autenticación requerida"
              : "Authentication Required"}
          </DialogTitle>
          <DialogDescription>
            {language === "es"
              ? "Por favor inicia sesión o crea una cuenta para sugerir adiciones al mapa."
              : "Please sign in or create an account to suggest additions to the map."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">
              {language === "es" ? "Iniciar Sesión" : "Sign In"}
            </TabsTrigger>
            <TabsTrigger value="signup">
              {language === "es" ? "Registrarse" : "Sign Up"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <Label htmlFor="signin-email">
                  {language === "es" ? "Correo Electrónico" : "Email"}
                </Label>
                <Input
                  id="signin-email"
                  type="email"
                  required
                  value={signInData.email}
                  onChange={(e) =>
                    setSignInData({ ...signInData, email: e.target.value })
                  }
                  placeholder="tu@email.com"
                />
              </div>

              <div>
                <Label htmlFor="signin-password">
                  {language === "es" ? "Contraseña" : "Password"}
                </Label>
                <Input
                  id="signin-password"
                  type="password"
                  required
                  value={signInData.password}
                  onChange={(e) =>
                    setSignInData({ ...signInData, password: e.target.value })
                  }
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {language === "es" ? "Iniciar Sesión" : "Sign In"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <Label htmlFor="signup-name">
                  {language === "es" ? "Nombre Completo" : "Full Name"}
                </Label>
                <Input
                  id="signup-name"
                  type="text"
                  required
                  value={signUpData.fullName}
                  onChange={(e) =>
                    setSignUpData({ ...signUpData, fullName: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="signup-email">
                  {language === "es" ? "Correo Electrónico" : "Email"}
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  required
                  value={signUpData.email}
                  onChange={(e) =>
                    setSignUpData({ ...signUpData, email: e.target.value })
                  }
                  placeholder="tu@email.com"
                />
              </div>

              <div>
                <Label htmlFor="signup-password">
                  {language === "es" ? "Contraseña" : "Password"}
                </Label>
                <Input
                  id="signup-password"
                  type="password"
                  required
                  value={signUpData.password}
                  onChange={(e) =>
                    setSignUpData({ ...signUpData, password: e.target.value })
                  }
                  minLength={6}
                />
              </div>

              <div>
                <Label htmlFor="signup-confirm-password">
                  {language === "es" ? "Confirmar Contraseña" : "Confirm Password"}
                </Label>
                <Input
                  id="signup-confirm-password"
                  type="password"
                  required
                  value={signUpData.confirmPassword}
                  onChange={(e) =>
                    setSignUpData({ ...signUpData, confirmPassword: e.target.value })
                  }
                  minLength={6}
                />
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {language === "es" ? "Crear Cuenta" : "Create Account"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
