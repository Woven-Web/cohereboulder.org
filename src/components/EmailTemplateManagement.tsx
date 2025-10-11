import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const EmailTemplateManagement = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    html_content: "",
    description: "",
  });

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error loading templates:", error);
      toast.error("Failed to load email templates");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      subject: template.subject,
      html_content: template.html_content,
      description: template.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      subject: "",
      html_content: "",
      description: "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            subject: formData.subject,
            html_content: formData.html_content,
            description: formData.description,
          })
          .eq("id", editingTemplate.id);

        if (error) throw error;
        toast.success("Email template updated");
      } else {
        const { error } = await supabase
          .from("email_templates")
          .insert({
            name: formData.name,
            subject: formData.subject,
            html_content: formData.html_content,
            description: formData.description,
          });

        if (error) throw error;
        toast.success("Email template created");
      }

      setIsDialogOpen(false);
      loadTemplates();
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Failed to save email template");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase
        .from("email_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Email template deleted");
      loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete email template");
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8">Loading templates...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Email Templates</h2>
          <p className="text-muted-foreground">
            Manage email templates sent to users. Use {`{{variable_name}}`} for dynamic content.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Email Template" : "Create Email Template"}
              </DialogTitle>
              <DialogDescription>
                Available variables: {`{{full_name}}, {{email}}`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={!!editingTemplate}
                  placeholder="e.g., welcome_email"
                />
              </div>
              <div>
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Welcome to COHERE!"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="When is this email sent?"
                />
              </div>
              <div>
                <Label htmlFor="html_content">HTML Content</Label>
                <Textarea
                  id="html_content"
                  value={formData.html_content}
                  onChange={(e) => setFormData({ ...formData, html_content: e.target.value })}
                  rows={15}
                  className="font-mono text-sm"
                  placeholder="<html>...</html>"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingTemplate ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{template.name}</CardTitle>
                  <CardDescription>{template.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(template.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <span className="font-semibold">Subject:</span> {template.subject}
                </div>
                <div className="text-sm text-muted-foreground">
                  Last updated: {new Date(template.updated_at).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
