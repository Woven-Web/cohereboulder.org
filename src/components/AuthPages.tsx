import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

export function AuthTabs() {
  const { signInWithOtp, verifyOtp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const handleSendOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get("email") as string;
    setEmail(emailValue);

    const { error } = await signInWithOtp(emailValue);

    if (error) {
      toast({
        title: "Error sending magic link",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Check your email!",
        description: "We've sent you a magic link and a verification code.",
      });
      setOtpSent(true);
    }

    setIsLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (otpCode.length !== 6) {
      toast({
        title: "Invalid code",
        description: "Please enter the complete 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await verifyOtp(email, otpCode);

    if (error) {
      toast({
        title: "Error verifying code",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Welcome!",
        description: "You've been signed in successfully.",
      });
      setOtpSent(false);
      setOtpCode("");
    }

    setIsLoading(false);
  };

  const handleResendOtp = async () => {
    setIsLoading(true);
    const { error } = await signInWithOtp(email);
    
    if (error) {
      toast({
        title: "Error resending code",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Code sent!",
        description: "We've sent you a new verification code.",
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
    <div className="max-w-md mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="signin">Sign In</TabsTrigger>
        </TabsList>

        <TabsContent value="signin">
          <Card>
            <CardHeader>
              <CardTitle>
                {otpSent ? "Enter Verification Code" : "Welcome back"}
              </CardTitle>
              <CardDescription>
                {otpSent
                  ? `We've sent a 6-digit code to ${email}. Enter it below or click the magic link in your email.`
                  : "Enter your email to receive a magic link and verification code"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      name="email"
                      type="email"
                      required
                      placeholder="your@email.com"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Send Magic Link
                  </Button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Check your email for a magic link, or enter the 6-digit code below:
                    </p>
                  </div>
                  
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp-code">Verification Code</Label>
                      <div className="flex justify-center">
                        <InputOTP
                          value={otpCode}
                          onChange={setOtpCode}
                          maxLength={6}
                        >
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
                    
                    <Button type="submit" className="w-full" disabled={isLoading || otpCode.length !== 6}>
                      {isLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Verify Code
                    </Button>
                  </form>

                  <div className="flex flex-col gap-2 text-center">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleResendOtp}
                      disabled={isLoading}
                    >
                      Resend code
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={resetFlow}
                    >
                      Use different email
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}