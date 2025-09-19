import React, { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const VerificationSuccess = () => {
  const { user, resendVerification } = useAuth();
  const { toast } = useToast();
  const [isResending, setIsResending] = useState(false);

  const handleResendVerification = async () => {
    setIsResending(true);
    const { error } = await resendVerification();
    
    if (error) {
      toast({
        title: "Error resending verification",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Verification email sent!",
        description: "Please check your email for the verification link."
      });
    }
    
    setIsResending(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />

      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <Card className="text-center">
            <CardHeader>
              <div className="mx-auto mb-4">
                <CheckCircle className="h-16 w-16 text-green-500" />
              </div>
              <CardTitle className="text-2xl">Email Verification</CardTitle>
              <CardDescription>
                {user?.email_confirmed_at 
                  ? "Your email has been verified successfully!"
                  : "Please check your email to verify your account"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {user?.email_confirmed_at ? (
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Your account is now verified and you have access to all features.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Button asChild>
                      <Link to="/">Return Home</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/register">Complete Registration</Link>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Mail className="h-5 w-5" />
                    <span>We've sent a verification link to {user?.email}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the email? Check your spam folder or click below to resend.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Button
                      onClick={handleResendVerification}
                      disabled={isResending}
                      variant="outline"
                    >
                      {isResending ? "Sending..." : "Resend Verification Email"}
                    </Button>
                    <Button asChild>
                      <Link to="/">Return Home</Link>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default VerificationSuccess;