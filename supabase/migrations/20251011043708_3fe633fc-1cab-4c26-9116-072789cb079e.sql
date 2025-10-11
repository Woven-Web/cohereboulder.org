-- Update the registration_confirmation template with the original content
UPDATE public.email_templates
SET html_content = '
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333; text-align: center; margin-bottom: 30px;">Welcome to COhere Boulder 2025!</h1>

        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #555; margin-top: 0;">Registration Confirmed</h2>
          <p>Hi {{full_name}},</p>
          <p>Thank you for registering for COhere Boulder 2025! We''re excited to weave you into the fabric of our community.</p>

          <h3 style="color: #555;">Your Registration Details:</h3>
          <ul style="margin: 15px 0;">
            <li><strong>Invocation (Opening) Gathering:</strong> Details coming soon</li>
            <li><strong>Integration (Closing) Party:</strong> Details coming soon</li>
          </ul>
        </div>

        <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #2d5a2d; margin-top: 0;">What''s Next?</h3>
          <ul style="margin: 15px 0; color: #333;">
            <li>📅 <strong>Mark your calendar:</strong> October 16-25, 2025</li>
            <li>📱 <strong>Join our community:</strong> <a href="https://cohereboulder.org/telegram" style="color: #007bff;">Join our Telegram group</a> to connect with the community</li>
            <li>📆 <strong>Community Calendar:</strong> View all upcoming events at <a href="https://cohereboulder.org/calendar" style="color: #007bff;">cohereboulder.org/calendar</a></li>
            <li>🎉 <strong>Invocation Gathering:</strong> Details and RSVP information coming soon</li>
            <li>🎟️ <strong>Event details:</strong> Specific event information and tickets will be shared as we get closer</li>
            <li>🤝 <strong>Get involved:</strong> If you expressed interest in co-creating, we''ll be in touch about opportunities</li>
          </ul>
        </div>

        <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #856404; margin-top: 0;">Stay Connected</h3>
          <p style="margin: 10px 0; color: #333;">
            Follow our updates and connect with the community as we build toward October:
          </p>
          <ul style="margin: 15px 0; color: #333;">
            <li>🌐 <strong>Website:</strong> Keep checking back for event announcements</li>
            <li>💌 <strong>Email updates:</strong> We''ll send you important announcements and event details</li>
            <li>🤝 <strong>Community:</strong> Join the Telegram group when invitations are sent</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://www.zeffy.com/en-US/donation-form/help-weave-boulders-resilience-support-cohere-boulder--2025"
             style="background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Support COhere with a Donation
          </a>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
          <p><strong>Questions?</strong> Feel free to reach out - we''re here to help make your COhere experience amazing.</p>
          <p>With gratitude and excitement for what we''ll create together,<br>
          <strong>The COhere Boulder Team</strong></p>
        </div>
      </div>
    ',
    subject = 'Welcome to COhere Boulder 2025 - Registration Confirmed! 🎉'
WHERE name = 'registration_confirmation';