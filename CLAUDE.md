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
