# Airtable Setup Guide for COhere Integration

## Step 1: Create Your Airtable Base

1. Go to [airtable.com](https://airtable.com) and create a free account if you don't have one
2. Create a new base called "COhere Boulder 2025"
3. Create a table called "Participants" with these fields:

### Participants Table Fields:
- **Name** (Single line text)
- **Email** (Email field type)
- **Organization** (Single line text)
- **Participation Types** (Multiple select field with options):
  - Attend events during October 16-26
  - Help organize and support COhere
  - Host an event during the 10-day container
  - Sponsor COhere Boulder 2025
  - Volunteer during events
- **Themes of Interest** (Multiple select field with options):
  - Ecology & Food Systems
  - Arts & Culture
  - Wellness
  - Technology & Innovation
  - Governance & Business
  - Villaging & Neighboring
- **Message** (Long text field)
- **Submitted Date** (Date field with time)
- **Status** (Single select field with options: New, Contacted, Confirmed, Declined)

## Step 2: Get Your API Credentials

### Get your API Key:
1. Go to [airtable.com/api](https://airtable.com/api)
2. Click on your account icon (top right)
3. Go to "Developer Hub"
4. Click "Create token"
5. Give it a name like "COhere Website Integration"
6. Select your base and give it permissions:
   - `data.records:read`
   - `data.records:write`
7. Copy the generated API key (starts with "pat...")

### Get your Base ID:
1. Go to [airtable.com/api](https://airtable.com/api)
2. Click on your "COhere Boulder 2025" base
3. The Base ID will be shown in the URL and documentation (starts with "app...")

## Step 3: Update Your Website Code

1. Open `src/components/InterestForm.tsx`
2. Replace these lines at the top:
   ```javascript
   const AIRTABLE_API_KEY = "your_airtable_api_key_here";
   const AIRTABLE_BASE_ID = "your_base_id_here";
   ```
   
   With your actual credentials:
   ```javascript
   const AIRTABLE_API_KEY = "pat_your_actual_api_key_here";
   const AIRTABLE_BASE_ID = "app_your_actual_base_id_here";
   ```

## Step 4: Test the Integration

1. Go to your website's "Get Involved" page
2. Fill out and submit the interest form
3. Check your Airtable base to see if the submission appears

## Security Note

Since this is a frontend-only integration, your API key will be visible in the browser's developer tools. This is acceptable for this use case since:
1. The API key only has access to your specific base
2. You can regenerate the key if needed
3. The free tier limits prevent abuse
4. This is a community interest form, not sensitive data

For production applications with sensitive data, consider using the Supabase integration with Edge Functions instead.

## Next Steps

Once this is working, you can:
1. Set up Airtable automations to send email notifications when new submissions arrive
2. Create different views in Airtable to organize submissions by status or participation type
3. Export data for outreach and event planning
4. Move on to implementing calendar integration with Airtable

## Troubleshooting

- **403 Error**: Check that your API key has the correct permissions
- **422 Error**: Make sure your field names in Airtable match exactly (case-sensitive)
- **Network Error**: Check that your Base ID is correct and the table name is "Participants"
- **Form not submitting**: Check the browser console for error messages