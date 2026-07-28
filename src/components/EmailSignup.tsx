import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const SIGNUP_ENDPOINT =
  import.meta.env.VITE_SIGNUP_URL || "https://cohere-signup.unforced.workers.dev/";

interface EmailSignupProps {
  source?: string;
  className?: string;
}

export const EmailSignup = ({ source = "homepage", className }: EmailSignupProps) => {
  const { tr, language } = useLanguage();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    try {
      const res = await fetch(SIGNUP_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website, source, language }),
      });
      if (!res.ok) throw new Error(`signup failed: ${res.status}`);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div
        className={`flex items-center justify-center gap-2 text-nature-green font-medium ${className ?? ""}`}
      >
        <CheckCircle2 className="h-5 w-5" />
        <span>{tr("signup.success")}</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={className}>
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={tr("signup.placeholder")}
          className="flex-1 bg-white text-foreground"
          aria-label={tr("signup.placeholder")}
        />
        <input
          type="text"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <Button type="submit" variant="community" disabled={status === "submitting"}>
          {status === "submitting" ? tr("signup.submitting") : tr("signup.button")}
        </Button>
      </div>
      {status === "error" && (
        <p className="text-sm text-destructive mt-2">{tr("signup.error")}</p>
      )}
    </form>
  );
};
