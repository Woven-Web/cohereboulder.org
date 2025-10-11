import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Eye } from "lucide-react";
import { marked } from "marked";
import { EmailPreview } from "./EmailPreview";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  markdown_content: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

const getEmailWrapper = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { 
      margin: 0; 
      padding: 0; 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
      background-color: #faf9f7;
    }
    .container { 
      max-width: 600px; 
      margin: 0 auto; 
      background-color: #ffffff; 
    }
    .header {
      background: linear-gradient(135deg, hsl(28, 45%, 25%), hsl(175, 65%, 35%));
      padding: 40px 20px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      font-size: 36px;
      margin: 0;
      font-weight: 700;
    }
    .header .bracket {
      color: #ffffff;
    }
    .header .here {
      color: hsl(42, 85%, 75%);
    }
    .content {
      padding: 40px 30px;
      color: hsl(28, 25%, 15%);
      line-height: 1.6;
    }
    .content h2 {
      color: hsl(175, 65%, 35%);
      margin-top: 0;
    }
    .content a {
      color: hsl(175, 65%, 35%);
      text-decoration: underline;
    }
    .button {
      display: inline-block;
      padding: 12px 32px;
      background: hsl(175, 65%, 35%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 12px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      background-color: hsl(42, 45%, 92%);
      padding: 30px;
      text-align: center;
      color: hsl(28, 15%, 45%);
      font-size: 14px;
    }
    .footer p {
      margin: 5px 0;
    }
    .divider {
      height: 4px;
      background: linear-gradient(90deg, hsl(175, 65%, 35%), hsl(42, 85%, 75%), hsl(22, 88%, 65%));
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1><span class="bracket">[CO]</span><span class="here">here</span></h1>
    </div>
    <div class="divider"></div>
    <div class="content">
      ${content}
    </div>
    <div class="divider"></div>
    <div class="footer">
      <p><strong>COhere</strong> - Weaving Community Together</p>
      <p>Boulder, Colorado</p>
      <p style="margin-top: 15px;">
        <a href="https://cohere.community" style="color: hsl(175, 65%, 35%); text-decoration: none;">cohere.community</a>
      </p>
    </div>
  </div>
</body>
</html>
`;

export const EmailTemplateManagement = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    subject: "",
    markdown_content: "",
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
      markdown_content: template.markdown_content,
      description: template.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      subject: "",
      markdown_content: "",
      description: "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      // Convert markdown to HTML
      const htmlContent = await marked(formData.markdown_content);
      const wrappedHtml = getEmailWrapper(htmlContent);

      if (editingTemplate) {
        const { error } = await supabase
          .from("email_templates")
          .update({
            subject: formData.subject,
            markdown_content: formData.markdown_content,
            html_content: wrappedHtml,
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
            markdown_content: formData.markdown_content,
            html_content: wrappedHtml,
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

  const getPreviewHtml = async () => {
    try {
      const markdown = formData.markdown_content
        .replace(/\{\{full_name\}\}/g, "John Doe")
        .replace(/\{\{email\}\}/g, "john.doe@example.com");
      const htmlContent = await marked(markdown);
      return getEmailWrapper(htmlContent);
    } catch (error) {
      console.error("Error rendering preview:", error);
      return "<p>Error rendering preview</p>";
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
          <DialogContent className="max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>
                {editingTemplate ? "Edit Email Template" : "Create Email Template"}
              </DialogTitle>
              <DialogDescription>
                Write your email in Markdown. Available variables: <code className="bg-muted px-1 rounded">{"{{full_name}}"}</code>, <code className="bg-muted px-1 rounded">{"{{email}}"}</code>
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden">
              <Tabs defaultValue="edit" className="h-full flex flex-col">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="edit" className="flex-1 overflow-y-auto mt-4 space-y-4">
                  <div>
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={!!editingTemplate}
                      placeholder="e.g., welcome_email"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Used to identify the template in code. Cannot be changed after creation.
                    </p>
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
                    <Label htmlFor="markdown_content">Email Content (Markdown)</Label>
                    <Textarea
                      id="markdown_content"
                      value={formData.markdown_content}
                      onChange={(e) => setFormData({ ...formData, markdown_content: e.target.value })}
                      rows={20}
                      className="font-mono text-sm"
                      placeholder="# Welcome to COhere!&#10;&#10;Hello {{full_name}},&#10;&#10;We're excited to have you join us...&#10;&#10;[Learn More](https://cohere.community)"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      💡 Tip: Use Markdown syntax. Your content will be automatically wrapped in COHERE branding.
                    </p>
                  </div>
                </TabsContent>
                
                <TabsContent value="preview" className="flex-1 overflow-y-auto mt-4">
                  <div className="border rounded-lg bg-white">
                    <div className="p-4 border-b">
                      <p className="text-sm text-muted-foreground">Subject:</p>
                      <p className="font-semibold">{formData.subject || "(No subject)"}</p>
                    </div>
                    <EmailPreview markdownContent={formData.markdown_content} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Preview shows sample data: John Doe, john.doe@example.com
                  </p>
                </TabsContent>
              </Tabs>
            </div>
            
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {editingTemplate ? "Update Template" : "Create Template"}
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
                <div className="flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <code className="text-sm bg-muted px-2 py-1 rounded">{template.name}</code>
                  </CardTitle>
                  <CardDescription className="mt-2">{template.description}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(template)}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
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
                  <span className="text-sm font-semibold">Subject:</span>{" "}
                  <span className="text-sm">{template.subject}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date(template.updated_at).toLocaleString()}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {templates.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No email templates yet</p>
              <Button onClick={handleNew}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Template
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
