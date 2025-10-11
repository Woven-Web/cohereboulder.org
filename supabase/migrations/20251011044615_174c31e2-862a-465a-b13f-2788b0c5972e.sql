-- Add markdown_content column to email_templates table
ALTER TABLE email_templates
ADD COLUMN IF NOT EXISTS markdown_content TEXT;

-- Migrate existing registration_confirmation template to markdown
UPDATE email_templates
SET markdown_content = '# Thank You for Registering!

Hello {{full_name}},

Thank you for registering for **COhere October 2025**!

We''re thrilled to have you join our gathering of changemakers, dreamers, and community builders. Your registration brings us one step closer to weaving together a vibrant tapestry of collaboration and transformation.

## What''s Next?

- **Save the dates**: October 9-19, 2025
- **Stay connected**: Watch for updates in your inbox
- **Get involved**: Check out the [COhere website](https://cohere.community) for more information

We''ll be in touch soon with more details about the event, including:
- The full schedule
- Ways to participate and co-create
- Information about our themes and tracks
- Connection opportunities with other attendees

## Questions?

Feel free to reach out to us at any time. We''re here to support your journey.

With gratitude and excitement,

**The COhere Team**

---

*This is an automated confirmation email. You''re receiving this because you registered for COhere October 2025.*'
WHERE name = 'registration_confirmation';

-- Update the html_content to use the new wrapper for existing template
-- This will be regenerated automatically when admins edit templates
