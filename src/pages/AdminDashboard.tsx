import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Users, 
  FileText, 
  Mail, 
  UserCheck, 
  Calendar,
  Download,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface RegistrationData {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  organizations: string;
  co_creating_interests: string[];
  can_attend_invocation: boolean;
  can_attend_integration: boolean;
  financial_contribution_interest: boolean;
  how_did_you_hear: string;
  additional_notes: string;
  marketing_consent: boolean;
  created_at: string;
}

interface InterestSubmission {
  id: string;
  name: string;
  email: string;
  organization: string;
  themes: string[];
  participation_types: string[];
  message: string;
  created_at: string;
}

interface EmailPreference {
  id: string;
  email: string;
  subscribed: boolean;
  marketing_consent: boolean;
  event_notifications: boolean;
  created_at: string;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email_verified: boolean;
  created_at: string;
}

const AdminDashboard = () => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const { toast } = useToast();
  
  const [registrations, setRegistrations] = useState<RegistrationData[]>([]);
  const [interestSubmissions, setInterestSubmissions] = useState<InterestSubmission[]>([]);
  const [emailPreferences, setEmailPreferences] = useState<EmailPreference[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadAllData();
    }
  }, [adminLoading, isAdmin]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      
      // Load registrations
      const { data: regData, error: regError } = await supabase
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (regError) throw regError;
      setRegistrations(regData || []);

      // Load interest submissions
      const { data: intData, error: intError } = await supabase
        .from('interest_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (intError) throw intError;
      setInterestSubmissions(intData || []);

      // Load email preferences
      const { data: emailData, error: emailError } = await supabase
        .from('email_preferences')
        .select('*')
        .order('created_at', { ascending: false });

      if (emailError) throw emailError;
      setEmailPreferences(emailData || []);

      // Load profiles
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileError) throw profileError;
      setProfiles(profileData || []);

    } catch (error) {
      console.error('Error loading admin data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCsv = (data: any[], filename: string) => {
    if (data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(header => {
          const value = row[header];
          if (Array.isArray(value)) return `"${value.join('; ')}"`;
          if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-earth-light/20">
      <Navigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Manage COhere Boulder community data and submissions
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Registrations</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{registrations.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Interest Submissions</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{interestSubmissions.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Email Subscribers</CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {emailPreferences.filter(e => e.subscribed).length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">User Profiles</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{profiles.length}</div>
                </CardContent>
              </Card>
            </div>

            {/* Data Tables */}
            <Tabs defaultValue="registrations" className="space-y-4">
              <TabsList>
                <TabsTrigger value="registrations">Registrations</TabsTrigger>
                <TabsTrigger value="interests">Interest Forms</TabsTrigger>
                <TabsTrigger value="emails">Email Preferences</TabsTrigger>
                <TabsTrigger value="profiles">User Profiles</TabsTrigger>
              </TabsList>

              <TabsContent value="registrations">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Event Registrations</CardTitle>
                      <CardDescription>
                        People registered for COhere Boulder 2025
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => exportToCsv(registrations, 'cohere-registrations.csv')}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {registrations.map((reg) => (
                        <div key={reg.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-semibold">{reg.full_name}</h3>
                              <p className="text-sm text-muted-foreground">{reg.email}</p>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(reg.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          
                          {reg.phone_number && (
                            <p className="text-sm"><strong>Phone:</strong> {reg.phone_number}</p>
                          )}
                          
                          {reg.organizations && (
                            <p className="text-sm"><strong>Organizations:</strong> {reg.organizations}</p>
                          )}
                          
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {reg.can_attend_invocation && (
                              <Badge variant="secondary">Can attend Invocation</Badge>
                            )}
                            {reg.can_attend_integration && (
                              <Badge variant="secondary">Can attend Integration</Badge>
                            )}
                            {reg.financial_contribution_interest && (
                              <Badge variant="outline">Interested in contributing</Badge>
                            )}
                            {reg.marketing_consent && (
                              <Badge variant="outline">Marketing consent</Badge>
                            )}
                          </div>
                          
                          {reg.co_creating_interests?.length > 0 && (
                            <div className="mt-2">
                              <strong className="text-sm">Co-creating interests:</strong>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {reg.co_creating_interests.map((interest, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {interest}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {reg.additional_notes && (
                            <p className="text-sm mt-2">
                              <strong>Notes:</strong> {reg.additional_notes}
                            </p>
                          )}
                          
                          {reg.how_did_you_hear && (
                            <p className="text-sm">
                              <strong>How they heard:</strong> {reg.how_did_you_hear}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="interests">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Interest Form Submissions</CardTitle>
                      <CardDescription>
                        People interested in co-creating and participating
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => exportToCsv(interestSubmissions, 'interest-submissions.csv')}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {interestSubmissions.map((submission) => (
                        <div key={submission.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-semibold">{submission.name}</h3>
                              <p className="text-sm text-muted-foreground">{submission.email}</p>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(submission.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          
                          {submission.organization && (
                            <p className="text-sm"><strong>Organization:</strong> {submission.organization}</p>
                          )}
                          
                          {submission.themes?.length > 0 && (
                            <div className="mt-2">
                              <strong className="text-sm">Themes:</strong>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {submission.themes.map((theme, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {theme}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {submission.participation_types?.length > 0 && (
                            <div className="mt-2">
                              <strong className="text-sm">Participation types:</strong>
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {submission.participation_types.map((type, idx) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {submission.message && (
                            <p className="text-sm mt-2">
                              <strong>Message:</strong> {submission.message}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="emails">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Email Preferences</CardTitle>
                      <CardDescription>
                        Newsletter and email notification preferences
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => exportToCsv(emailPreferences, 'email-preferences.csv')}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {emailPreferences.map((pref) => (
                        <div key={pref.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="font-medium">{pref.email}</p>
                              <div className="flex gap-2 mt-2">
                                <Badge variant={pref.subscribed ? "default" : "destructive"}>
                                  {pref.subscribed ? "Subscribed" : "Unsubscribed"}
                                </Badge>
                                {pref.marketing_consent && (
                                  <Badge variant="secondary">Marketing consent</Badge>
                                )}
                                {pref.event_notifications && (
                                  <Badge variant="outline">Event notifications</Badge>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(pref.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="profiles">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>User Profiles</CardTitle>
                      <CardDescription>
                        Registered user accounts and profile information
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={() => exportToCsv(profiles, 'user-profiles.csv')}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {profiles.map((profile) => (
                        <div key={profile.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-semibold">{profile.full_name || 'No name provided'}</h3>
                              <p className="text-sm text-muted-foreground">ID: {profile.user_id}</p>
                              <div className="mt-2">
                                <Badge variant={profile.email_verified ? "default" : "destructive"}>
                                  {profile.email_verified ? "Email verified" : "Email not verified"}
                                </Badge>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {new Date(profile.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      
      <Footer />
    </div>
  );
};

export default AdminDashboard;