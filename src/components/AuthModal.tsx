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
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AuthModal({ open, onOpenChange, onSuccess }: AuthModalProps) {
  const { signInWithOtp, verifyOtp } = useAuth();
  const { toast } = useToast();
  const { language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signInWithOtp(email);

    if (error) {
      toast({
        title:
          language === "es" ? "Error enviando código" : "Error sending code",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: language === "es" ? "¡Revisa tu email!" : "Check your email!",
        description:
          language === "es"
            ? "Te hemos enviado un enlace mágico y un código de 6 dígitos. Puedes usar cualquiera de los dos."
            : "We've sent you a magic link and a 6-digit code. You can use either one.",
      });
      setOtpSent(true);
    }

    setIsLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (otpCode.length !== 6) {
      toast({
        title: language === "es" ? "Código inválido" : "Invalid code",
        description:
          language === "es"
            ? "Por favor ingresa el código completo de 6 dígitos."
            : "Please enter the complete 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await verifyOtp(email, otpCode);

    if (error) {
      toast({
        title:
          language === "es"
            ? "Error verificando código"
            : "Error verifying code",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: language === "es" ? "¡Bienvenido!" : "Welcome!",
        description:
          language === "es"
            ? "Has iniciado sesión exitosamente."
            : "You have successfully signed in.",
      });
      onOpenChange(false);
      onSuccess?.();
      // Reset state
      setOtpSent(false);
      setEmail("");
      setOtpCode("");
    }

    setIsLoading(false);
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    const { error } = await signInWithOtp(email);

    if (error) {
      toast({
        title:
          language === "es"
            ? "Error reenviando código"
            : "Error resending code",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: language === "es" ? "¡Código enviado!" : "Code sent!",
        description:
          language === "es"
            ? "Te hemos enviado un nuevo enlace mágico y código de verificación."
            : "We've sent you a new magic link and verification code.",
      });
    }

    setIsLoading(false);
  };

  const resetFlow = () => {
    setOtpSent(false);
    setEmail("");
    setOtpCode("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {otpSent
              ? language === "es"
                ? "Ingresa el Código"
                : "Enter Verification Code"
              : language === "es"
                ? "Iniciar Sesión"
                : "Sign In"}
          </DialogTitle>
          <DialogDescription>
            {otpSent
              ? language === "es"
                ? `Hemos enviado un código de 6 dígitos y un enlace mágico a ${email}. Puedes usar cualquiera de las dos opciones para ingresar.`
                : `We've sent a 6-digit code and a magic link to ${email}. You can use either option to sign in.`
              : language === "es"
                ? "Ingresa tu email para recibir un enlace mágico y código de verificación"
                : "Enter your email to receive a magic link and verification code"}
          </DialogDescription>
        </DialogHeader>

        {!otpSent ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <Label htmlFor="signin-email">
                {language === "es" ? "Correo Electrónico" : "Email"}
              </Label>
              <Input
                id="signin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {language === "es" ? "Enviar Enlace Mágico" : "Send Magic Link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                {language === "es"
                  ? "Opción 1: Haz clic en el enlace mágico en tu email"
                  : "Option 1: Click the magic link in your email"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {language === "es"
                  ? "Opción 2: Ingresa el código de 6 dígitos abajo:"
                  : "Option 2: Enter the 6-digit code below:"}
              </p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-code">
                  {language === "es"
                    ? "Código de Verificación"
                    : "Verification Code"}
                </Label>
                <div className="flex justify-center">
                  <InputOTP value={otpCode} onChange={setOtpCode} maxLength={6}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || otpCode.length !== 6}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {language === "es" ? "Verificar Código" : "Verify Code"}
              </Button>
            </form>

            <div className="flex flex-col gap-2 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResendOtp}
                disabled={isLoading}
              >
                {language === "es" ? "Reenviar código" : "Resend code"}
              </Button>
              <Button variant="ghost" size="sm" onClick={resetFlow}>
                {language === "es" ? "Usar otro email" : "Use different email"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
