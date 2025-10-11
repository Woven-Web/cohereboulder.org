import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Mail,
  UserCheck,
  Calendar,
  Download,
  Loader2,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EventsManagement } from "@/components/EventsManagement";
import { EmailTemplateManagement } from "@/components/EmailTemplateManagement";
import { EmailCampaignManagement } from "@/components/EmailCampaignManagement";

interface ProfileData {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  phone_number: string | null;
  organizations: string | null;
  subscribed: boolean | null;
  role: "admin" | "moderator" | "user" | null;
  created_at: string;
  updated_at: string;
  registrations?: RegistrationData[];
}

interface RegistrationData {
  id: string;
  profile_id: string;
  cohere_event: string;
  can_attend_invocation: boolean | null;
  can_attend_integration: boolean | null;
  co_creating_interests: string[] | null;
  how_did_you_hear: string | null;
  additional_notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MapSuggestion {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;
  website: string | null;
  contact_email: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  user?: {
    email: string;
    user_metadata?: {
      full_name?: string;
    };
  };
}

const COHERE_EVENT = "october2025";

const AdminDashboard = () => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const { toast } = useToast();

  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [mapSuggestions, setMapSuggestions] = useState<MapSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadProfilesData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLoading, isAdmin]);

  const loadProfilesData = async () => {
    try {
      setLoading(true);

      // Load all profiles with their registrations for the current event
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          `
          *,
          registrations!inner (
            *
          )
        `,
        )
        .eq("registrations.cohere_event", COHERE_EVENT)
        .order("created_at", { ascending: false });

      const { data: profilesWithoutReg, error: profilesWithoutRegError } =
        await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false });

      if (profileError && profilesWithoutRegError) {
        throw profileError || profilesWithoutRegError;
      }

      // Combine the data - profiles with registrations + profiles without
      const profilesWithRegistrations = profileData || [];
      const allProfiles = profilesWithoutReg || [];

      // Create a map to track which profiles have registrations
      const profilesWithRegMap = new Set(
        profilesWithRegistrations.map((p: ProfileData) => p.id),
      );

      // Add profiles without registrations
      const profilesWithoutRegistrations = allProfiles.filter(
        (p: ProfileData) => !profilesWithRegMap.has(p.id),
      );

      const combinedProfiles = [
        ...profilesWithRegistrations,
        ...profilesWithoutRegistrations.map((p) => ({
          ...p,
          registrations: [],
        })),
      ];

      setProfiles(combinedProfiles);

      // Load map suggestions (without auth.users join since it's not accessible from client)
      const { data: suggestionsData, error: suggestionsError } = await supabase
        .from("map_suggestions")
        .select("*")
        .order("created_at", { ascending: false });

      if (suggestionsError) {
        console.error("Error loading map suggestions:", suggestionsError);
      } else {
        setMapSuggestions((suggestionsData || []) as any);
      }
    } catch (error) {
      console.error("Error loading admin data:", error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToCsv = (data: ProfileData[], filename: string) => {
    if (data.length === 0) return;

    // Flatten the data for CSV export
    const flatData = data.map((profile) => {
      const registration = profile.registrations?.[0];
      return {
        email: profile.email,
        full_name: profile.full_name,
        phone_number: profile.phone_number,
        organizations: profile.organizations,
        subscribed: profile.subscribed ? "Yes" : "No",
        role: profile.role,
        has_account: profile.user_id ? "Yes" : "No",
        registered: registration ? "Yes" : "No",
        can_attend_invocation: registration?.can_attend_invocation
          ? "Yes"
          : registration?.can_attend_invocation === false
            ? "No"
            : "",
        can_attend_integration: registration?.can_attend_integration
          ? "Yes"
          : registration?.can_attend_integration === false
            ? "No"
            : "",
        co_creating_interests:
          registration?.co_creating_interests?.join("; ") || "",
        how_did_you_hear: registration?.how_did_you_hear || "",
        additional_notes: registration?.additional_notes || "",
        profile_created: new Date(profile.created_at).toLocaleDateString(),
        registration_created: registration
          ? new Date(registration.created_at).toLocaleDateString()
          : "",
      };
    });

    const headers = Object.keys(flatData[0]);
    const csvContent = [
      headers.join(","),
      ...flatData.map((row) =>
        headers
          .map((header) => {
            const value = row[header as keyof typeof row];
            if (value === null || value === undefined) return "";
            if (typeof value === "string")
              return `"${value.replace(/"/g, '""')}"`;
            return value;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Filter profiles based on different criteria
  const registeredProfiles = profiles.filter(
    (p) => p.registrations && p.registrations.length > 0,
  );
  const unregisteredProfiles = profiles.filter(
    (p) => !p.registrations || p.registrations.length === 0,
  );
  const subscribedProfiles = profiles.filter((p) => p.subscribed);
  const authenticatedProfiles = profiles.filter((p) => p.user_id !== null);
  const adminProfiles = profiles.filter((p) => p.role === "admin");

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
            Manage COhere Boulder community members
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Profiles
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{profiles.length}</div>
                  <p className="text-xs text-muted-foreground">
                    All community profiles
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Registered
                  </CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {registeredProfiles.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    For {COHERE_EVENT}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Email Subscribers
                  </CardTitle>
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {subscribedProfiles.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Active subscribers
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Authenticated
                  </CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {authenticatedProfiles.length}
                  </div>
                  <p className="text-xs text-muted-foreground">With accounts</p>
                </CardContent>
              </Card>
            </div>

            {/* Secondary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Not Registered
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {unregisteredProfiles.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Map Suggestions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {mapSuggestions.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Admins</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {adminProfiles.length}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Data Tables */}
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="space-y-4"
            >
              <TabsList>
                <TabsTrigger value="all">All Profiles</TabsTrigger>
                <TabsTrigger value="registered">Registered</TabsTrigger>
                <TabsTrigger value="unregistered">Not Registered</TabsTrigger>
                <TabsTrigger value="map-suggestions">
                  Map Suggestions
                </TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="emails">Email Templates</TabsTrigger>
                <TabsTrigger value="campaigns">Email Campaigns</TabsTrigger>
                <TabsTrigger value="unsubscribed">Unsubscribed</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <ProfilesList
                  profiles={profiles}
                  title="All Community Profiles"
                  description="Complete list of all profiles in the database"
                  exportFilename="all-profiles.csv"
                  onExport={() => exportToCsv(profiles, "all-profiles.csv")}
                />
              </TabsContent>

              <TabsContent value="registered">
                <ProfilesList
                  profiles={registeredProfiles}
                  title={`Registered for COhere ${COHERE_EVENT}`}
                  description="Profiles who have completed event registration"
                  exportFilename="registered-profiles.csv"
                  onExport={() =>
                    exportToCsv(registeredProfiles, "registered-profiles.csv")
                  }
                />
              </TabsContent>

              <TabsContent value="unregistered">
                <ProfilesList
                  profiles={unregisteredProfiles}
                  title="Not Yet Registered"
                  description="Profiles without registrations for the current event"
                  exportFilename="unregistered-profiles.csv"
                  onExport={() =>
                    exportToCsv(
                      unregisteredProfiles,
                      "unregistered-profiles.csv",
                    )
                  }
                />
              </TabsContent>

              <TabsContent value="map-suggestions">
                <MapSuggestionsList
                  suggestions={mapSuggestions}
                  onStatusChange={async (id, status) => {
                    try {
                      const { error } = await supabase
                        .from("map_suggestions")
                        .update({ status })
                        .eq("id", id);

                      if (error) throw error;

                      toast({
                        title: "Success",
                        description: `Suggestion status updated to ${status}`,
                      });

                      // Reload data
                      loadProfilesData();
                    } catch (error) {
                      console.error("Error updating suggestion status:", error);
                      toast({
                        title: "Error",
                        description: "Failed to update suggestion status",
                        variant: "destructive",
                      });
                    }
                  }}
                />
              </TabsContent>

              <TabsContent value="events">
                <EventsManagement />
              </TabsContent>

              <TabsContent value="emails">
                <EmailTemplateManagement />
              </TabsContent>

              <TabsContent value="campaigns">
                <EmailCampaignManagement />
              </TabsContent>

              <TabsContent value="unsubscribed">
                <ProfilesList
                  profiles={profiles.filter((p) => !p.subscribed)}
                  title="Unsubscribed Profiles"
                  description="Profiles who have opted out of email communications"
                  exportFilename="unsubscribed-profiles.csv"
                  onExport={() =>
                    exportToCsv(
                      profiles.filter((p) => !p.subscribed),
                      "unsubscribed-profiles.csv",
                    )
                  }
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <Footer />
    </div>
  );
};

// Component to display profile list
interface ProfilesListProps {
  profiles: ProfileData[];
  title: string;
  description: string;
  exportFilename: string;
  onExport: () => void;
}

const ProfilesList: React.FC<ProfilesListProps> = ({
  profiles,
  title,
  description,
  onExport,
}) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button variant="outline" onClick={onExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {profiles.length === 0 ? (
            <p className="text-muted-foreground">
              No profiles found in this category.
            </p>
          ) : (
            profiles.map((profile) => {
              const registration = profile.registrations?.[0];
              return (
                <div key={profile.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{profile.full_name}</h3>
                        {profile.role === "admin" && (
                          <Badge variant="destructive" className="gap-1">
                            <Shield className="h-3 w-3" />
                            Admin
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {profile.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">
                        Profile:{" "}
                        {new Date(profile.created_at).toLocaleDateString()}
                      </div>
                      {registration && (
                        <div className="text-sm text-muted-foreground">
                          Registered:{" "}
                          {new Date(
                            registration.created_at,
                          ).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {profile.phone_number && (
                    <p className="text-sm">
                      <strong>Phone:</strong> {profile.phone_number}
                    </p>
                  )}

                  {profile.organizations && (
                    <p className="text-sm">
                      <strong>Organizations:</strong> {profile.organizations}
                    </p>
                  )}

                  <div className="flex gap-2 mt-2 flex-wrap">
                    {registration ? (
                      <Badge variant="default">
                        Registered for {COHERE_EVENT}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Not registered</Badge>
                    )}

                    {profile.user_id && (
                      <Badge variant="secondary">Has Account</Badge>
                    )}

                    {registration?.can_attend_invocation && (
                      <Badge variant="outline">Invocation</Badge>
                    )}

                    {registration?.can_attend_integration && (
                      <Badge variant="outline">Integration</Badge>
                    )}

                    {profile.subscribed ? (
                      <Badge variant="default">Subscribed</Badge>
                    ) : (
                      <Badge variant="destructive">Unsubscribed</Badge>
                    )}
                  </div>

                  {registration?.co_creating_interests?.length ? (
                    <div className="mt-2">
                      <strong className="text-sm">
                        Co-creating interests:
                      </strong>
                      <div className="text-xs text-muted-foreground mt-1">
                        {registration.co_creating_interests.map(
                          (interest, idx) => (
                            <div key={idx}>• {interest}</div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : null}

                  {registration?.how_did_you_hear && (
                    <p className="text-sm mt-2">
                      <strong>How they heard:</strong>{" "}
                      {registration.how_did_you_hear}
                    </p>
                  )}

                  {registration?.additional_notes && (
                    <p className="text-sm mt-2">
                      <strong>Notes:</strong> {registration.additional_notes}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Component to display map suggestions
interface MapSuggestionsListProps {
  suggestions: MapSuggestion[];
  onStatusChange: (id: string, status: string) => Promise<void>;
}

const MapSuggestionsList: React.FC<MapSuggestionsListProps> = ({
  suggestions,
  onStatusChange,
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Map Suggestions</CardTitle>
        <CardDescription>
          Community suggestions for additions to the ecosystem map
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {suggestions.length === 0 ? (
            <p className="text-muted-foreground">No map suggestions yet.</p>
          ) : (
            suggestions.map((suggestion) => (
              <div key={suggestion.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{suggestion.name}</h3>
                      <Badge
                        variant={
                          suggestion.status === "approved"
                            ? "default"
                            : suggestion.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {suggestion.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Submitted by: {suggestion.contact_email}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">
                      {suggestion.created_at
                        ? new Date(suggestion.created_at).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </div>
                </div>

                <div className="mt-2">
                  <p className="text-sm">
                    <strong>Description:</strong> {suggestion.description}
                  </p>
                </div>

                {suggestion.website && (
                  <p className="text-sm mt-2">
                    <strong>Website:</strong>{" "}
                    <a
                      href={suggestion.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {suggestion.website}
                    </a>
                  </p>
                )}

                {suggestion.category && (
                  <p className="text-sm mt-2">
                    <strong>Category:</strong> {suggestion.category}
                  </p>
                )}

                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(suggestion.id, "approved")}
                    disabled={suggestion.status === "approved"}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onStatusChange(suggestion.id, "pending")}
                    disabled={suggestion.status === "pending"}
                  >
                    Set Pending
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => onStatusChange(suggestion.id, "rejected")}
                    disabled={suggestion.status === "rejected"}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminDashboard;
