# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

COhere Boulder is a community-building web application for Boulder's regenerative ecosystem, migrated from Lovable to local development. It showcases community events, values, and resources through a modern React application.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server on port 8080
npm run dev

# Build for production
npm run build

# Build for development mode
npm run build:dev

# Run linting
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Tech Stack

- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom theme extensions
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Routing**: React Router v6
- **State Management**: React Query (TanStack Query)
- **Forms**: React Hook Form with Zod validation

### Project Structure

```
src/
├── pages/          # Route components (Index, About, CoCreate, Calendar)
├── components/     # Reusable components
│   ├── ui/        # shadcn/ui components (auto-generated)
│   └── [custom]   # App-specific components
├── assets/        # Images and static files
├── hooks/         # Custom React hooks
└── lib/           # Utilities (utils.ts)
```

### Key Components

- **Navigation**: Responsive navigation with mobile menu (src/components/Navigation.tsx:119)
- **HeroSection**: Landing page hero with gradient animations (src/components/HeroSection.tsx:85)
- **EcosystemMap**: Community ecosystem visualization (src/components/EcosystemMap.tsx:72)
- **Footer**: Site footer with newsletter signup (src/components/Footer.tsx:110)

### Routing Structure

- `/` - Landing page with ecosystem map and event info
- `/about` - "Tell Me More" - detailed event structure
- `/co-create` - Co-creation opportunities and participation
- `/calendar` - Community events calendar
- `*` - 404 Not Found page

### Design System

#### Custom Tailwind Extensions

- **Colors**: earth, sage, sunset, sky themes with light/DEFAULT/dark variants
- **Animations**: float, glow, sway for interactive elements
- **Gradients**: gradient-earth, gradient-sky, gradient-sunset, gradient-community

#### Component Variants

- Button variants: default, nature, community, earth
- Custom CSS variables for theming in globals.css

## Important Context

### Migration from Lovable

This project was initially created on Lovable.dev (Project ID: 0db2af12-4b3b-492c-b29e-c2dbee86d7b6) and has been migrated for local development. The original cohereboulder.org website content has been recreated in this React application.

### Content Focus

The application centers around COhere Boulder 2024, a 10-day immersive community experience focused on regenerative practices and community building in Boulder, Colorado. Key themes include:

- Community web strengthening
- Regenerative ecosystem mapping
- Collaborative events and co-creation
- Values-driven community building

### Assets

Static images are stored in src/assets/ including:

- ecosystem-map.jpg - Main community map visualization
- hero-community.jpg - Hero section background
- Various supporting images for content sections

## Development Notes

- The application uses server-side compatible rendering setup with Vite
- Port 8080 is configured as the default development port
- Component tagger is enabled in development mode for Lovable compatibility
- Path aliases configured: `@/` maps to `./src/`

## Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Reference `.env.example` for a template. The `.env` file is gitignored to prevent accidental commits of sensitive data.

## Code Standards

### TypeScript Configuration

- **Strict mode enabled**: The project uses TypeScript strict mode for better type safety
- All components must have proper TypeScript interfaces
- Avoid using `any` type - use proper type definitions or generics
- Enable all strict checks in `tsconfig.json`

### Code Quality

- No console.log statements in production code (use proper logging service if needed)
- Follow existing code patterns and conventions in the codebase
- Use semantic HTML for better accessibility
- Implement proper error boundaries for production resilience

### Security Best Practices

- Never commit secrets or API keys to the repository
- All sensitive configuration must use environment variables
- Use `.env` files for local development only
- Validate all user inputs on both client and server
- Sanitize any user-generated content before rendering

## Error Handling

The application includes:

- **Global Error Boundary**: Catches React component errors and displays user-friendly fallback UI
- **React.StrictMode**: Enabled in development for detecting potential problems
- **Environment Variable Validation**: Throws clear errors if required env vars are missing

## Testing Commands

```bash
# Type checking
npx tsc --noEmit

# Linting
npm run lint

# Build validation
npm run build
```

## GitHub Pages Deployment

The project is configured for automatic deployment to GitHub Pages:

1. **Automatic Deployment**: Pushes to `main` branch trigger deployment via GitHub Actions
2. **Required Setup**: Configure GitHub Secrets for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
3. **Deployment Guide**: See `DEPLOYMENT.md` for detailed setup instructions

The deployment workflow (`.github/workflows/deploy.yml`) handles:

- Building with environment variables from GitHub Secrets
- Uploading artifacts to GitHub Pages
- Automatic deployment on main branch updates
