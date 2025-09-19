import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface EmailPreferences {
  email: string;
  subscribed: boolean;
  marketing_consent: boolean;
  event_notifications: boolean;
}

const Unsubscribe = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [preferences, setPreferences] = useState<EmailPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) {
      setError('Invalid unsubscribe link');
      setLoading(false);
      return;
    }

    fetchPreferences();
  }, [token]);

  const fetchPreferences = async () => {
    try {
      const response = await fetch(
        `https://pnvxrczcygrkbschkvkv.supabase.co/functions/v1/unsubscribe?token=${token}`
      );
      
      if (!response.ok) {
        throw new Error('Invalid unsubscribe token');
      }

      const data = await response.json();
      setPreferences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async () => {
    if (!preferences || !token) return;

    setUpdating(true);
    try {
      const response = await fetch(
        `https://pnvxrczcygrkbschkvkv.supabase.co/functions/v1/unsubscribe?token=${token}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(preferences),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update preferences');
      }

      toast({
        title: "Preferences Updated",
        description: "Your email preferences have been updated successfully.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to update preferences',
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const unsubscribeAll = () => {
    setPreferences(prev => prev ? {
      ...prev,
      subscribed: false,
      marketing_consent: false,
      event_notifications: false
    } : null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
        <Navigation />
        <section className="py-20 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <p>Loading...</p>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
        <Navigation />
        <section className="py-20 px-4">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-destructive">Error</CardTitle>
              </CardHeader>
              <CardContent>
                <p>{error}</p>
              </CardContent>
            </Card>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />
      
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <CardTitle>Email Preferences</CardTitle>
              <CardDescription>
                Manage your email preferences for {preferences?.email}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="subscribed"
                    checked={preferences?.subscribed || false}
                    onCheckedChange={(checked) =>
                      setPreferences(prev => prev ? {
                        ...prev,
                        subscribed: checked as boolean
                      } : null)
                    }
                  />
                  <label htmlFor="subscribed" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Keep me subscribed to all emails
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="event_notifications"
                    checked={preferences?.event_notifications || false}
                    onCheckedChange={(checked) =>
                      setPreferences(prev => prev ? {
                        ...prev,
                        event_notifications: checked as boolean
                      } : null)
                    }
                  />
                  <label htmlFor="event_notifications" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Send me notifications about upcoming COhere events
                  </label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="marketing_consent"
                    checked={preferences?.marketing_consent || false}
                    onCheckedChange={(checked) =>
                      setPreferences(prev => prev ? {
                        ...prev,
                        marketing_consent: checked as boolean
                      } : null)
                    }
                  />
                  <label htmlFor="marketing_consent" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Send me marketing emails and community updates
                  </label>
                </div>
              </div>

              <div className="flex space-x-4">
                <Button
                  onClick={updatePreferences}
                  disabled={updating}
                  className="flex-1"
                >
                  {updating ? 'Updating...' : 'Update Preferences'}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={unsubscribeAll}
                  className="flex-1"
                >
                  Unsubscribe from All
                </Button>
              </div>

              <div className="text-sm text-muted-foreground pt-4 border-t">
                <p>
                  Note: If you unsubscribe from all emails, you won't receive important updates about 
                  events you've registered for. You can always update your preferences using this link.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Unsubscribe;