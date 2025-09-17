# COhere Boulder - Project Overview

## Project Summary

COhere Boulder is a community-focused web application that serves as the digital presence for Boulder's regenerative ecosystem initiative. The project was originally developed on Lovable.dev and has been migrated for local development. It showcases a 10-day immersive community experience focused on strengthening connections within Boulder's regenerative community.

## Technical Architecture

### Core Stack
- **Framework**: React 18.3.1 with TypeScript 5.8.3
- **Build Tool**: Vite 5.4.19 with SWC for fast refresh
- **Styling**: Tailwind CSS 3.4.17 with custom theme extensions
- **UI Library**: shadcn/ui (built on Radix UI primitives)
- **Routing**: React Router DOM 6.30.1
- **State Management**: TanStack Query (React Query) 5.83.0
- **Form Handling**: React Hook Form 7.61.1 with Zod 3.25.76 validation

### Development Setup
```bash
# Development server runs on port 8080
npm run dev

# Production build
npm run build

# Linting
npm run lint

# Preview production build
npm run preview
```

## Project Structure

```
cohereboulder.org/
├── src/
│   ├── pages/              # Route components
│   │   ├── Index.tsx       # Landing page with ecosystem map
│   │   ├── About.tsx       # "Tell Me More" - event details
│   │   ├── CoCreate.tsx    # Co-creation opportunities
│   │   ├── Calendar.tsx    # Community events calendar
│   │   └── NotFound.tsx    # 404 page
│   │
│   ├── components/         # Reusable components
│   │   ├── ui/            # shadcn/ui components (45+ components)
│   │   ├── Navigation.tsx  # Main navigation (119 lines)
│   │   ├── HeroSection.tsx # Landing hero (85 lines)
│   │   ├── Footer.tsx      # Site footer (110 lines)
│   │   ├── EcosystemMap.tsx
│   │   ├── MissionSection.tsx
│   │   ├── ValuesSection.tsx
│   │   └── SupportSection.tsx
│   │
│   ├── assets/            # Static images
│   │   ├── ecosystem-map.jpg    # Community map visualization
│   │   ├── hero-community.jpg   # Hero background
│   │   ├── honeycomb-lattice.jpg
│   │   ├── spider-web.png
│   │   ├── game-structure.jpg
│   │   ├── collaboration.png
│   │   └── cohere-logo.png
│   │
│   ├── hooks/             # Custom React hooks
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   │
│   ├── lib/              # Utilities
│   │   └── utils.ts      # Helper functions
│   │
│   ├── App.tsx           # Main app component with routing
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
│
├── public/               # Static files
├── dev-docs/            # Development documentation
└── Configuration files
    ├── vite.config.ts   # Vite configuration
    ├── tailwind.config.ts # Tailwind theme
    ├── tsconfig.json    # TypeScript config
    ├── package.json     # Dependencies
    └── CLAUDE.md        # AI assistant context

```

## Design System

### Custom Theme Extensions

The project extends Tailwind with a nature-inspired color palette:

#### Color Palette
- **Earth tones**: `earth-warm`, `earth-light`
- **Nature colors**: `nature-teal`, `nature-green`
- **Community colors**: `community-orange`, `community-yellow`
- **Gradients**: `gradient-earth`, `gradient-community`, `gradient-nature`

#### Custom Animations
- `float`: Floating effect for decorative elements
- `glow`: Glowing pulse effect
- `sway`: Gentle swaying motion
- `slide-up`: Entrance animation for content

#### Component Variants
- **Button variants**: `default`, `nature`, `community`, `earth`
- **Custom shadows**: `shadow-warm`, `shadow-community`

### UI Component Library

The project uses shadcn/ui components, including:
- Form components (Input, Select, Checkbox, Radio, etc.)
- Layout components (Card, Sheet, Tabs, Accordion)
- Feedback components (Toast, Alert, Progress)
- Navigation components (Navigation Menu, Dropdown Menu)
- Data display (Table, Badge, Avatar)
- Overlay components (Dialog, Popover, Tooltip)

## Content & Features

### Main Pages

1. **Landing Page (/)**:
   - Hero section with event dates and registration
   - Ecosystem map visualization (created with Climatique)
   - YouTube video embed showcasing COhere 2024
   - Mission and values sections
   - Timeline visualization (placeholder)
   - Support section with partnership opportunities

2. **About Page (/about)**:
   - "A Game You Say?" section explaining the immersive experience
   - Spider web metaphor for community connections
   - Game structure and rules
   - Timeline of 10-day experience
   - Cross-pollination concept

3. **Co-Create Page (/co-create)**:
   - Participation opportunities
   - Event hosting guidelines
   - Co-creation principles
   - Community involvement options

4. **Calendar Page (/calendar)**:
   - Community events listing
   - Event categories and filtering
   - Integration with broader Boulder ecosystem

### Key Features
- Responsive navigation with mobile menu
- Newsletter signup integration
- Telegram community link
- Bilingual support (English/Spanish) for registration
- Interactive ecosystem map
- Event calendar system
- Social media integration

## Development History

### Git Timeline
The project history shows a migration from Lovable.dev to local development:

1. **Initial Setup** (commit 1693aa1): Used Lovable's vite_react_shadcn_ts template
2. **Content Creation** (commit 4258078): Recreated cohereboulder.org structure
3. **Page Development** (commits e0bf451-019a6e4): Built out About, Calendar, and Co-Create pages
4. **Content Refinement** (commit f6c3474): Refined page content and styling
5. **Feature Updates** (commits 59de494-d333823): Updated individual pages with final content
6. **Media Integration** (commit 469b987): Embedded YouTube video on main page

### Migration Context
- Original Lovable Project ID: `0db2af12-4b3b-492c-b29e-c2dbee86d7b6`
- Migrated to enable local development and version control
- Maintains Lovable compatibility through component tagger in dev mode

## Project Context

### COhere Boulder 2024
The website supports a 10-day immersive community experience (October 17-26, 2025) focused on:
- **Community Web Strengthening**: Building cross-connections between existing community threads
- **Regenerative Practices**: Highlighting and supporting regenerative projects in Boulder
- **Cross-Pollination**: Encouraging collaboration across different sectors (food, movement, government, social justice)
- **Game Mechanics**: Using gamification to encourage community participation

### Community Partners
- Collaboration with Climatique for ecosystem mapping
- Integration with local Boulder organizations
- Support from various regenerative initiatives

### Target Audience
- Boulder residents interested in regenerative practices
- Community organizers and activists
- Environmental and social justice advocates
- Local businesses and organizations
- Spanish-speaking community members (bilingual support)

## Technical Considerations

### Performance
- Vite provides fast HMR in development
- Image assets are optimized and lazy-loaded
- Component code splitting via React.lazy (if implemented)

### Accessibility
- Semantic HTML structure
- ARIA labels on interactive components
- Keyboard navigation support via Radix UI
- Color contrast compliance

### Deployment
- Built for static hosting (Netlify, Vercel, etc.)
- Environment-agnostic build process
- No backend dependencies (frontend-only application)

### Future Enhancements
Potential areas for expansion based on current structure:
- Backend API integration for dynamic event data
- User authentication for event registration
- CMS integration for content management
- Analytics and tracking implementation
- Progressive Web App features
- Internationalization beyond Spanish

## Developer Notes

### Code Conventions
- TypeScript strict mode enabled
- Component files use PascalCase
- Hooks and utilities use camelCase
- Path aliases: `@/` maps to `./src/`
- CSS-in-JS via Tailwind utility classes

### Testing Strategy
No test framework currently configured. Consider adding:
- Vitest for unit testing
- React Testing Library for component testing
- Playwright/Cypress for E2E testing

### State Management
Currently using:
- React Query for server state (prepared for future API integration)
- Local component state via useState/useReducer
- Form state via React Hook Form

This project represents a community-driven initiative to strengthen Boulder's regenerative ecosystem through digital presence and event coordination. The codebase is structured for maintainability and future expansion while maintaining a focus on community engagement and accessibility.
