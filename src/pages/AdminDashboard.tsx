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
  FileText,
  Mail,
  UserCheck,
  Calendar,
  Download,
  Loader2,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface MemberData {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  phone_number: string;
  organizations: string;
  registration_status: string;
  can_attend_invocation: boolean | null;
  can_attend_integration: boolean | null;
  co_creating_interests: string[];
  financial_contribution_interest: boolean;
  how_did_you_hear: string;
  additional_notes: string;
  participation_types: string[];
  themes: string[];
  subscribed: boolean;
  marketing_consent: boolean;
  event_notifications: boolean;
  role: "admin" | "moderator" | "user";
  internal_notes: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  source: string;
}

const AdminDashboard = () => {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const { toast } = useToast();

  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadMembersData();
    }
  }, [adminLoading, isAdmin]);

  const loadMembersData = async () => {
    try {
      setLoading(true);

      // Load all member data from unified table
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("*")
        .order("created_at", { ascending: false });

      if (memberError) throw memberError;
      setMembers(memberData || []);
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

  const exportToCsv = (data: any[], filename: string) => {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            if (value === null || value === undefined) return "";
            if (Array.isArray(value)) return `"${value.join("; ")}"`;
            if (typeof value === "string")
              return `"${value.replace(/"/g, '""')}"`;
            if (typeof value === "boolean") return value ? "Yes" : "No";
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

  // Filter members based on different criteria
  const registeredMembers = members.filter(
    (m) => m.registration_status === "registered",
  );
  const interestedMembers = members.filter(
    (m) => m.registration_status === "interested",
  );
  const subscribedMembers = members.filter((m) => m.subscribed);
  const authenticatedMembers = members.filter((m) => m.user_id !== null);
  const adminMembers = members.filter((m) => m.role === "admin");
  const coCreators = members.filter(
    (m) => m.co_creating_interests && m.co_creating_interests.length > 0,
  );

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
            Manage COhere Boulder community members (unified database)
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
                    Total Members
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{members.length}</div>
                  <p className="text-xs text-muted-foreground">
                    All community members
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
                    {registeredMembers.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Event registrations
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
                    {subscribedMembers.length}
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
                    {authenticatedMembers.length}
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
                    Interested
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">
                    {interestedMembers.length}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Co-Creators
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{coCreators.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Admins</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-xl font-bold">{adminMembers.length}</div>
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
                <TabsTrigger value="all">All Members</TabsTrigger>
                <TabsTrigger value="registered">Registered</TabsTrigger>
                <TabsTrigger value="interested">Interested</TabsTrigger>
                <TabsTrigger value="cocreators">Co-Creators</TabsTrigger>
                <TabsTrigger value="unsubscribed">Unsubscribed</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <MembersList
                  members={members}
                  title="All Community Members"
                  description="Complete list of all members in the database"
                  exportFilename="all-members.csv"
                  onExport={() => exportToCsv(members, "all-members.csv")}
                />
              </TabsContent>

              <TabsContent value="registered">
                <MembersList
                  members={registeredMembers}
                  title="Registered for COhere 2025"
                  description="Members who have completed event registration"
                  exportFilename="registered-members.csv"
                  onExport={() =>
                    exportToCsv(registeredMembers, "registered-members.csv")
                  }
                />
              </TabsContent>

              <TabsContent value="interested">
                <MembersList
                  members={interestedMembers}
                  title="Interested Members"
                  description="People who expressed interest but haven't registered yet"
                  exportFilename="interested-members.csv"
                  onExport={() =>
                    exportToCsv(interestedMembers, "interested-members.csv")
                  }
                />
              </TabsContent>

              <TabsContent value="cocreators">
                <MembersList
                  members={coCreators}
                  title="Co-Creators"
                  description="Members interested in co-creating events and activities"
                  exportFilename="cocreators.csv"
                  onExport={() => exportToCsv(coCreators, "cocreators.csv")}
                />
              </TabsContent>

              <TabsContent value="unsubscribed">
                <MembersList
                  members={members.filter((m) => !m.subscribed)}
                  title="Unsubscribed Members"
                  description="Members who have opted out of email communications"
                  exportFilename="unsubscribed-members.csv"
                  onExport={() =>
                    exportToCsv(
                      members.filter((m) => !m.subscribed),
                      "unsubscribed-members.csv",
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

// Component to display member list
interface MembersListProps {
  members: MemberData[];
  title: string;
  description: string;
  exportFilename: string;
  onExport: () => void;
}

const MembersList: React.FC<MembersListProps> = ({
  members,
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
          {members.length === 0 ? (
            <p className="text-muted-foreground">
              No members found in this category.
            </p>
          ) : (
            members.map((member) => (
              <div key={member.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{member.full_name}</h3>
                      {member.role === "admin" && (
                        <Badge variant="destructive" className="gap-1">
                          <Shield className="h-3 w-3" />
                          Admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {member.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-muted-foreground">
                      {new Date(member.created_at).toLocaleDateString()}
                    </div>
                    {member.source && (
                      <Badge variant="outline" className="text-xs mt-1">
                        {member.source}
                      </Badge>
                    )}
                  </div>
                </div>

                {member.phone_number && (
                  <p className="text-sm">
                    <strong>Phone:</strong> {member.phone_number}
                  </p>
                )}

                {member.organizations && (
                  <p className="text-sm">
                    <strong>Organizations:</strong> {member.organizations}
                  </p>
                )}

                <div className="flex gap-2 mt-2 flex-wrap">
                  <Badge
                    variant={
                      member.registration_status === "registered"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {member.registration_status || "interested"}
                  </Badge>

                  {member.user_id && (
                    <Badge variant="secondary">Has Account</Badge>
                  )}

                  {member.can_attend_invocation && (
                    <Badge variant="outline">Invocation</Badge>
                  )}

                  {member.can_attend_integration && (
                    <Badge variant="outline">Integration</Badge>
                  )}

                  {member.financial_contribution_interest && (
                    <Badge variant="outline">May Contribute $</Badge>
                  )}

                  {member.subscribed ? (
                    <Badge variant="default">Subscribed</Badge>
                  ) : (
                    <Badge variant="destructive">Unsubscribed</Badge>
                  )}

                  {member.marketing_consent && (
                    <Badge variant="outline">Marketing OK</Badge>
                  )}
                </div>

                {member.co_creating_interests?.length > 0 && (
                  <div className="mt-2">
                    <strong className="text-sm">Co-creating interests:</strong>
                    <div className="text-xs text-muted-foreground mt-1">
                      {member.co_creating_interests.map((interest, idx) => (
                        <div key={idx}>• {interest}</div>
                      ))}
                    </div>
                  </div>
                )}

                {member.participation_types?.length > 0 && (
                  <div className="mt-2">
                    <strong className="text-sm">Participation types:</strong>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {member.participation_types.map((type, idx) => (
                        <Badge
                          key={idx}
                          variant="secondary"
                          className="text-xs"
                        >
                          {type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {member.themes?.length > 0 && (
                  <div className="mt-2">
                    <strong className="text-sm">Themes:</strong>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {member.themes.map((theme, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {member.how_did_you_hear && (
                  <p className="text-sm mt-2">
                    <strong>How they heard:</strong> {member.how_did_you_hear}
                  </p>
                )}

                {member.additional_notes && (
                  <p className="text-sm mt-2">
                    <strong>Notes:</strong> {member.additional_notes}
                  </p>
                )}

                {member.internal_notes && (
                  <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                    <p className="text-sm">
                      <strong>Internal notes:</strong> {member.internal_notes}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminDashboard;
