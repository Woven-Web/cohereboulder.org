import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Send,
  Eye,
  Loader2,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
}

interface EmailCampaign {
  id: string;
  subject: string;
  filter_criteria: Record<string, any>;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  status: "draft" | "sending" | "sent" | "failed";
  sent_at: string | null;
  created_at: string;
}

interface FilterCriteria {
  subscribed?: boolean;
  can_attend_invocation?: boolean | "maybe";
  can_attend_integration?: boolean | "maybe";
  co_creating_interests?: string[];
  registered_before?: string; // ISO date string
}

interface RecipientProfile {
  id: string;
  email: string;
  full_name: string;
}

export const EmailCampaignManagement = () => {
  const { tr } = useLanguage();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [recipients, setRecipients] = useState<RecipientProfile[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(
    new Set(),
  );

  // Multi-step confirmation state
  const [confirmationStep, setConfirmationStep] = useState(0);
  const [finalConfirmText, setFinalConfirmText] = useState("");

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [filters, setFilters] = useState<FilterCriteria>({
    subscribed: true, // Default to only subscribed users
  });

  const coCreatingOptions = [
    tr("registration.coCreatingOptions.hostEvent"),
    tr("registration.coCreatingOptions.hostDinner"),
    tr("registration.coCreatingOptions.volunteer"),
    tr("registration.coCreatingOptions.tellStories"),
  ];

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Update preview count when filters change
    if (isDialogOpen) {
      loadPreviewCount();
    }
  }, [filters, isDialogOpen]);

  const loadData = async () => {
    try {
      // Load email templates
      const { data: templatesData, error: templatesError } = await supabase
        .from("email_templates")
        .select("id, name, subject")
        .order("name");

      if (templatesError) throw templatesError;
      setTemplates(templatesData || []);

      // Load campaigns
      await loadCampaigns();
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load email campaign data");
    } finally {
      setLoading(false);
    }
  };

  const loadCampaigns = async () => {
    const { data, error } = await supabase
      .from("email_campaigns" as any)
      .select("id, subject, filter_criteria, recipients_count, sent_count, failed_count, status, sent_at, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading campaigns:", error);
      return;
    }

    setCampaigns((data || []) as unknown as EmailCampaign[]);
  };

  const loadPreviewCount = async () => {
    setLoadingPreview(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "preview-campaign-recipients",
        {
          body: { filters, includeProfiles: true },
        },
      );

      if (error) throw error;
      setPreviewCount(data.count || 0);
      setRecipients(data.profiles || []);

      // Select all recipients by default
      if (data.profiles) {
        setSelectedRecipients(
          new Set(data.profiles.map((p: RecipientProfile) => p.id)),
        );
      }
    } catch (error) {
      console.error("Error loading preview:", error);
      setPreviewCount(0);
      setRecipients([]);
      setSelectedRecipients(new Set());
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCoCreatingInterestToggle = (
    interest: string,
    checked: boolean,
  ) => {
    setFilters((prev) => {
      const interests = prev.co_creating_interests || [];
      return {
        ...prev,
        co_creating_interests: checked
          ? [...interests, interest]
          : interests.filter((i) => i !== interest),
      };
    });
  };

  const toggleRecipient = (recipientId: string) => {
    setSelectedRecipients((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(recipientId)) {
        newSet.delete(recipientId);
      } else {
        newSet.add(recipientId);
      }
      return newSet;
    });
  };

  const toggleAllRecipients = () => {
    if (selectedRecipients.size === recipients.length) {
      setSelectedRecipients(new Set());
    } else {
      setSelectedRecipients(new Set(recipients.map((r) => r.id)));
    }
  };

  const handleSendCampaign = async () => {
    if (!selectedTemplateId) {
      toast.error("Please select an email template");
      return;
    }

    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
    if (!selectedTemplate) {
      toast.error("Invalid template selected");
      return;
    }

    if (selectedRecipients.size === 0) {
      toast.error("Please select at least one recipient");
      return;
    }

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-campaign", {
        body: {
          templateId: selectedTemplateId,
          filters,
          selectedRecipientIds: Array.from(selectedRecipients),
        },
      });

      if (error) throw error;

      toast.success(
        `Campaign sent successfully to ${data.sent_count} recipient${data.sent_count !== 1 ? "s" : ""}`,
      );

      // Reset state
      setIsDialogOpen(false);
      setSelectedTemplateId("");
      setFilters({ subscribed: true });
      setConfirmationStep(0);
      setFinalConfirmText("");
      setSelectedRecipients(new Set());

      loadCampaigns();
    } catch (error: any) {
      console.error("Error sending campaign:", error);
      toast.error(error.message || "Failed to send email campaign");
    } finally {
      setIsSending(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "sending":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatFilterCriteria = (criteria: Record<string, any>) => {
    const parts: string[] = [];

    if (criteria.subscribed) parts.push("Subscribed");
    if (criteria.can_attend_invocation === true)
      parts.push("Can attend Invocation");
    if (criteria.can_attend_invocation === false)
      parts.push("Cannot attend Invocation");
    if (criteria.can_attend_invocation === "maybe")
      parts.push("Maybe attend Invocation");
    if (criteria.can_attend_integration === true)
      parts.push("Can attend Integration");
    if (criteria.can_attend_integration === false)
      parts.push("Cannot attend Integration");
    if (criteria.can_attend_integration === "maybe")
      parts.push("Maybe attend Integration");
    if (criteria.co_creating_interests?.length > 0) {
      parts.push(`Interests: ${criteria.co_creating_interests.join(", ")}`);
    }
    if (criteria.registered_before) {
      const date = new Date(criteria.registered_before).toLocaleDateString();
      parts.push(`Registered before ${date}`);
    }

    return parts.length > 0 ? parts.join(" • ") : "No filters";
  };

  const renderConfirmationDialog = () => {
    const selectedCount = selectedRecipients.size;
    const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

    if (confirmationStep === 0) {
      return (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Campaign Details
            </DialogTitle>
            <DialogDescription>
              Step 1 of 3: Review the campaign details before proceeding
            </DialogDescription>
          </DialogHeader>

          <Alert variant="default" className="border-amber-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Important: Review Before Sending</AlertTitle>
            <AlertDescription>
              You are about to send an email campaign. Please carefully review
              all details.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label className="font-semibold">Email Template</Label>
              <p className="text-sm">
                {selectedTemplate?.name} - {selectedTemplate?.subject}
              </p>
            </div>

            <div>
              <Label className="font-semibold">Recipients Selected</Label>
              <p className="text-sm text-lg font-bold text-primary">
                {selectedCount} recipient{selectedCount !== 1 ? "s" : ""}
              </p>
            </div>

            <div>
              <Label className="font-semibold">Filter Criteria</Label>
              <p className="text-sm">{formatFilterCriteria(filters)}</p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmationStep(0);
                setIsDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => setConfirmationStep(1)}
              disabled={selectedCount === 0}
            >
              Continue to Next Step
            </Button>
          </DialogFooter>
        </DialogContent>
      );
    }

    if (confirmationStep === 1) {
      return (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Review Recipients
            </DialogTitle>
            <DialogDescription>
              Step 2 of 3: Verify the list of people who will receive this email
            </DialogDescription>
          </DialogHeader>

          <Alert variant="default" className="border-amber-500">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Double Check Recipients</AlertTitle>
            <AlertDescription>
              These {selectedCount} people will receive the email. Make sure
              this is correct.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="font-semibold">
                Selected Recipients ({selectedCount})
              </Label>
              <Button variant="ghost" size="sm" onClick={toggleAllRecipients}>
                {selectedRecipients.size === recipients.length
                  ? "Deselect All"
                  : "Select All"}
              </Button>
            </div>
            <ScrollArea className="h-[300px] border rounded-lg p-4">
              {recipients.map((recipient) => (
                <div
                  key={recipient.id}
                  className="flex items-center space-x-2 py-2"
                >
                  <Checkbox
                    checked={selectedRecipients.has(recipient.id)}
                    onCheckedChange={() => toggleRecipient(recipient.id)}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{recipient.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {recipient.email}
                    </p>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmationStep(0)}>
              Back
            </Button>
            <Button
              onClick={() => setConfirmationStep(2)}
              disabled={selectedCount === 0}
            >
              Continue to Final Confirmation
            </Button>
          </DialogFooter>
        </DialogContent>
      );
    }

    if (confirmationStep === 2) {
      const confirmPhrase = `SEND TO ${selectedCount}`;
      return (
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Final Confirmation Required
            </DialogTitle>
            <DialogDescription>
              Step 3 of 3: Type the confirmation phrase to send
            </DialogDescription>
          </DialogHeader>

          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This Action Cannot Be Undone</AlertTitle>
            <AlertDescription>
              Once sent, you cannot recall this email. It will be sent to{" "}
              {selectedCount} recipient{selectedCount !== 1 ? "s" : ""}.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-semibold">Campaign Summary:</p>
              <ul className="text-sm space-y-1 ml-4">
                <li>• Template: {selectedTemplate?.subject}</li>
                <li>• Recipients: {selectedCount} people</li>
                <li>
                  • This email will be sent immediately after confirmation
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">
                Type "{confirmPhrase}" to confirm
              </Label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded-md"
                placeholder={confirmPhrase}
                value={finalConfirmText}
                onChange={(e) => setFinalConfirmText(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmationStep(1);
                setFinalConfirmText("");
              }}
            >
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={handleSendCampaign}
              disabled={
                isSending ||
                finalConfirmText !== confirmPhrase ||
                selectedCount === 0
              }
            >
              {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Send className="mr-2 h-4 w-4" />
              Send Campaign Now
            </Button>
          </DialogFooter>
        </DialogContent>
      );
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading campaigns...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Email Campaigns</h2>
          <p className="text-muted-foreground">
            Send targeted emails to registered users based on their preferences
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setConfirmationStep(0);
              setFinalConfirmText("");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Send className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>

          {confirmationStep > 0 ? (
            renderConfirmationDialog()
          ) : (
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Email Campaign</DialogTitle>
                <DialogDescription>
                  Select a template and filter your audience
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 py-4">
                {/* Template Selection */}
                <div className="space-y-2">
                  <Label>Email Template</Label>
                  <Select
                    value={selectedTemplateId}
                    onValueChange={setSelectedTemplateId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} - {template.subject}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Filters */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold">Filter Recipients</h3>

                  {/* Subscription Status */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="subscribed"
                      checked={filters.subscribed === true}
                      onCheckedChange={(checked) =>
                        setFilters((prev) => ({
                          ...prev,
                          subscribed: checked as boolean,
                        }))
                      }
                    />
                    <label htmlFor="subscribed" className="text-sm">
                      Only send to subscribed users
                    </label>
                  </div>

                  {/* Invocation Attendance */}
                  <div className="space-y-2">
                    <Label>Invocation Attendance</Label>
                    <Select
                      value={
                        filters.can_attend_invocation === undefined
                          ? "any"
                          : filters.can_attend_invocation === true
                            ? "yes"
                            : filters.can_attend_invocation === false
                              ? "no"
                              : "maybe"
                      }
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          can_attend_invocation:
                            value === "any"
                              ? undefined
                              : value === "yes"
                                ? true
                                : value === "no"
                                  ? false
                                  : "maybe",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="yes">Yes - Can attend</SelectItem>
                        <SelectItem value="maybe">Maybe</SelectItem>
                        <SelectItem value="no">No - Cannot attend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Integration Attendance */}
                  <div className="space-y-2">
                    <Label>Integration Attendance</Label>
                    <Select
                      value={
                        filters.can_attend_integration === undefined
                          ? "any"
                          : filters.can_attend_integration === true
                            ? "yes"
                            : filters.can_attend_integration === false
                              ? "no"
                              : "maybe"
                      }
                      onValueChange={(value) =>
                        setFilters((prev) => ({
                          ...prev,
                          can_attend_integration:
                            value === "any"
                              ? undefined
                              : value === "yes"
                                ? true
                                : value === "no"
                                  ? false
                                  : "maybe",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any</SelectItem>
                        <SelectItem value="yes">Yes - Can attend</SelectItem>
                        <SelectItem value="maybe">Maybe</SelectItem>
                        <SelectItem value="no">No - Cannot attend</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Co-Creating Interests */}
                  <div className="space-y-2">
                    <Label>Co-Creating Interests (OR logic)</Label>
                    <p className="text-xs text-muted-foreground">
                      Will include users who selected ANY of these options
                    </p>
                    <div className="space-y-2">
                      {coCreatingOptions.map((option) => (
                        <div
                          key={option}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`interest-${option}`}
                            checked={
                              filters.co_creating_interests?.includes(option) ||
                              false
                            }
                            onCheckedChange={(checked) =>
                              handleCoCreatingInterestToggle(
                                option,
                                checked as boolean,
                              )
                            }
                          />
                          <label
                            htmlFor={`interest-${option}`}
                            className="text-sm"
                          >
                            {option}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Registration Date Filter */}
                  <div className="space-y-2">
                    <Label htmlFor="registered-before">
                      Registered Before Date
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Only include people who registered before this date
                    </p>
                    <input
                      id="registered-before"
                      type="date"
                      className="w-full px-3 py-2 border rounded-md"
                      value={
                        filters.registered_before
                          ? filters.registered_before.split("T")[0]
                          : ""
                      }
                      onChange={(e) => {
                        // Convert date to ISO timestamp at end of day
                        const dateValue = e.target.value;
                        if (dateValue) {
                          const endOfDay = new Date(dateValue);
                          endOfDay.setHours(23, 59, 59, 999);
                          setFilters((prev) => ({
                            ...prev,
                            registered_before: endOfDay.toISOString(),
                          }));
                        } else {
                          setFilters((prev) => ({
                            ...prev,
                            registered_before: undefined,
                          }));
                        }
                      }}
                    />
                    {filters.registered_before && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            registered_before: undefined,
                          }))
                        }
                      >
                        Clear date filter
                      </Button>
                    )}
                  </div>
                </div>

                {/* Preview Count */}
                <div className="bg-muted p-4 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-muted-foreground" />
                    <span className="font-semibold">
                      {loadingPreview ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading...
                        </span>
                      ) : previewCount !== null ? (
                        `${previewCount} recipient${previewCount !== 1 ? "s" : ""} match this criteria`
                      ) : (
                        "Select filters to see recipient count"
                      )}
                    </span>
                  </div>
                  {previewCount !== null && previewCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {selectedRecipients.size} of {recipients.length} selected
                    </p>
                  )}
                </div>

                {/* Recipient List Preview */}
                {recipients.length > 0 && (
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex justify-between items-center">
                      <Label className="font-semibold">
                        Matching Recipients ({recipients.length})
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={toggleAllRecipients}
                      >
                        {selectedRecipients.size === recipients.length
                          ? "Deselect All"
                          : "Select All"}
                      </Button>
                    </div>
                    <ScrollArea className="h-[200px] border rounded-lg p-4">
                      {recipients.map((recipient) => (
                        <div
                          key={recipient.id}
                          className="flex items-center space-x-2 py-2 hover:bg-muted"
                        >
                          <Checkbox
                            checked={selectedRecipients.has(recipient.id)}
                            onCheckedChange={() =>
                              toggleRecipient(recipient.id)
                            }
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              {recipient.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {recipient.email}
                            </p>
                          </div>
                        </div>
                      ))}
                    </ScrollArea>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setConfirmationStep(1)}
                  disabled={
                    !selectedTemplateId || selectedRecipients.size === 0
                  }
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Review & Send
                </Button>
              </DialogFooter>
            </DialogContent>
          )}
        </Dialog>
      </div>

      {/* Campaign History */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Campaign History</h3>
        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">
                No campaigns sent yet
              </p>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Send className="h-4 w-4 mr-2" />
                Send Your First Campaign
              </Button>
            </CardContent>
          </Card>
        ) : (
          campaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      {getStatusIcon(campaign.status)}
                      {campaign.subject}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {formatFilterCriteria(campaign.filter_criteria)}
                    </CardDescription>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    {campaign.sent_at
                      ? new Date(campaign.sent_at).toLocaleString()
                      : new Date(campaign.created_at).toLocaleString()}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="text-muted-foreground">Recipients: </span>
                    <span className="font-semibold">
                      {campaign.recipients_count}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sent: </span>
                    <span className="font-semibold text-green-600">
                      {campaign.sent_count}
                    </span>
                  </div>
                  {campaign.failed_count > 0 && (
                    <div>
                      <span className="text-muted-foreground">Failed: </span>
                      <span className="font-semibold text-red-600">
                        {campaign.failed_count}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
