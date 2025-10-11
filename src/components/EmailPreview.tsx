import { useEffect, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { getEmailWrapper } from "@/lib/emailWrapper";

interface EmailPreviewProps {
  markdownContent: string;
}

export const EmailPreview = ({ markdownContent }: EmailPreviewProps) => {
  const [html, setHtml] = useState("");

  useEffect(() => {
    const renderPreview = async () => {
      try {
        const markdown = markdownContent
          .replace(/\{\{full_name\}\}/g, "John Doe")
          .replace(/\{\{email\}\}/g, "john.doe@example.com");

        const htmlContent = await marked(markdown);
        const sanitized = DOMPurify.sanitize(htmlContent);
        const wrapped = getEmailWrapper(sanitized);
        setHtml(wrapped);
      } catch (error) {
        console.error("Error rendering preview:", error);
        setHtml("<p>Error rendering preview</p>");
      }
    };

    renderPreview();
  }, [markdownContent]);

  return (
    <iframe
      srcDoc={html}
      className="w-full h-[500px] border-0"
      title="Email Preview"
      sandbox="allow-same-origin"
    />
  );
};
