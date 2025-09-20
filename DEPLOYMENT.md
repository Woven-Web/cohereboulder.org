# GitHub Pages Deployment Guide

## Prerequisites

Before deploying to GitHub Pages, you need to configure GitHub Secrets for the Supabase environment variables.

## Setting up GitHub Secrets

**IMPORTANT**: Use **Repository secrets**, NOT Environment secrets!

1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Make sure you're on the **Secrets** tab (NOT Variables or Environments)
4. Click **"New repository secret"** button
5. Add each secret one by one:

### Required Secrets

| Secret Name              | Description                        | Example Value                      |
| ------------------------ | ---------------------------------- | ---------------------------------- |
| `VITE_SUPABASE_URL`      | Your Supabase project URL          | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key | `eyJhbGciOiJIUzI1NiIsInR5cCI...`   |

### How to Get Your Supabase Credentials

1. Log in to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → Use as `VITE_SUPABASE_URL`
   - **Anon/Public Key** → Use as `VITE_SUPABASE_ANON_KEY`

## Deployment Process

The deployment to GitHub Pages is automated via GitHub Actions:

1. **Automatic Deployment**: Every push to the `main` branch triggers deployment
2. **Manual Deployment**: Go to Actions → Deploy to GitHub Pages → Run workflow

### Deployment Workflow

The `.github/workflows/deploy.yml` workflow:

1. Checks out the code
2. Sets up Node.js 20
3. Installs dependencies
4. Builds the project with environment variables from GitHub Secrets
5. Deploys to GitHub Pages

## Local Testing

To test the production build locally:

```bash
# Make sure your .env file exists with the required variables
npm run build
npm run preview
```

## Important Notes

- **Security**: The Supabase anon key is a public key designed to be exposed in client-side applications
- **RLS Policies**: Ensure your Supabase database has proper Row Level Security policies configured
- **Environment Variables**: The build process injects environment variables at build time, not runtime
- **GitHub Pages URL**: Your site will be available at `https://[username].github.io/[repository-name]/`

## Troubleshooting

### Build Fails with Missing Environment Variables

**Error**: `Missing Supabase environment variables. Please check your .env file.`

**Common Causes & Solutions**:

1. **Wrong Secret Type**: Make sure you added **Repository secrets**, not Environment secrets
   - Go to Settings → Secrets and variables → Actions
   - Click on the **Secrets** tab (not Environments)
   - You should see your secrets listed under "Repository secrets"

2. **Secrets Not Set**: Ensure both secrets are added:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

3. **Typos in Secret Names**: Secret names are case-sensitive
   - Must match exactly: `VITE_SUPABASE_URL` not `VITE_SUPABASE_url`

4. **Workflow Not Re-run**: After adding secrets, you need to re-run the deployment
   - Go to Actions tab → Re-run the failed workflow
   - Or push a new commit to trigger deployment

### Site Shows 404 After Deployment

**Solution**:

1. Check that GitHub Pages is enabled in Settings → Pages
2. Ensure the source is set to "GitHub Actions"
3. Wait a few minutes for deployment to complete

### Local Build Works but GitHub Pages Deployment Fails

**Solution**:

1. Verify GitHub Secrets are set correctly (no extra spaces or quotes)
2. Check the Actions tab for detailed error logs
3. Ensure the secrets match exactly what's in your local `.env` file

## Monitoring Deployments

Track deployment status:

1. Go to the **Actions** tab in your repository
2. Click on the latest "Deploy to GitHub Pages" workflow
3. View detailed logs for each step

## Rolling Back

If you need to rollback to a previous version:

1. Go to the **Actions** tab
2. Find a previous successful deployment
3. Click "Re-run all jobs" to redeploy that version
