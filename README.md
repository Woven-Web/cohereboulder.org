# COhere Boulder 🌱

A community web application for Boulder's regenerative ecosystem, fostering connection and collaboration among changemakers.

## About COhere Boulder

COhere Boulder is a 10-day immersive community experience focused on strengthening the regenerative ecosystem in Boulder, Colorado. This web application serves as the digital hub for the community, providing:

- 🗺️ **Ecosystem Mapping** - Visual representation of Boulder's regenerative community network
- 📅 **Event Calendar** - Schedule of community gatherings and collaborative sessions
- 🤝 **Co-Creation Opportunities** - Ways for community members to contribute and participate
- 🌍 **Bilingual Support** - Full Spanish/English translations for inclusive engagement

### Our Mission

To weave together Boulder's regenerative community through shared experiences, collaborative events, and meaningful connections. We believe in creating a resilient, interconnected ecosystem where every member can contribute to positive change.

## 🚀 Live Site

Visit [cohereboulder.org](https://cohereboulder.org) to explore the community platform.

## 🛠️ Technology Stack

This modern web application is built with:

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: Tailwind CSS with custom earth-themed design system
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Database**: Supabase for backend services
- **Routing**: React Router v6
- **Forms**: React Hook Form with Zod validation
- **Deployment**: GitHub Pages with GitHub Actions CI/CD

## 📋 Prerequisites

- Node.js 18+ and npm (install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating))
- Git for version control
- A Supabase account (for database features)

## 🏃 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Woven-Web/cohereboulder.org.git
cd cohereboulder.org
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example environment file and add your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase project details:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Start the development server

```bash
npm run dev
```

The application will be available at [http://localhost:8080](http://localhost:8080)

## 📚 Development

### Available Scripts

```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Run linting
npm run lint

# Type checking
npx tsc --noEmit
```

### Project Structure

```
src/
├── pages/          # Route components
│   ├── Index.tsx   # Landing page
│   ├── About.tsx   # Event details
│   ├── CoCreate.tsx # Co-creation opportunities
│   └── Calendar.tsx # Event calendar
├── components/     # Reusable components
│   ├── ui/        # shadcn/ui components
│   └── ...        # App-specific components
├── contexts/      # React context providers
├── hooks/         # Custom React hooks
├── lib/           # Utilities and helpers
└── assets/        # Images and static files
```

### Design System

The application features a custom earth-themed design system with:

- **Color Palette**: earth, sage, sunset, sky themes
- **Animations**: Smooth float, pulse, and sway effects
- **Gradients**: Community-inspired gradient backgrounds
- **Typography**: Clean, accessible font hierarchy

## 🚢 Deployment

The site automatically deploys to GitHub Pages when changes are pushed to the `main` branch.

For manual deployment or troubleshooting, see [DEPLOYMENT.md](./DEPLOYMENT.md).

### Setting up GitHub Secrets

For deployment to work, configure these secrets in your GitHub repository:

1. Go to Settings → Secrets and variables → Actions
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting (`npm run lint && npm run build`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Standards

- **TypeScript**: Strict mode enabled for type safety
- **Components**: Functional components with proper TypeScript interfaces
- **Styling**: Use Tailwind utility classes, follow existing patterns
- **Accessibility**: Ensure WCAG compliance, semantic HTML
- **Security**: Never commit secrets, use environment variables

For detailed development guidelines, see [CLAUDE.md](./CLAUDE.md).

## 📖 Documentation

- [CLAUDE.md](./CLAUDE.md) - Development guidelines and project standards
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Detailed deployment instructions
- [Design System](./src/index.css) - Custom theme and styling variables

## 🌟 Features

### Current Features

- ✅ Responsive design for all devices
- ✅ Bilingual support (English/Spanish)
- ✅ Interactive ecosystem map
- ✅ Event calendar with detailed schedules
- ✅ Co-creation sign-up forms
- ✅ Newsletter subscription
- ✅ Global error boundary for production resilience

### Roadmap

- 🔄 User authentication and profiles
- 🔄 Community forum and discussions
- 🔄 Resource library
- 🔄 Event RSVP system
- 🔄 Community member directory

## 🐛 Troubleshooting

### Common Issues

**Environment Variables Not Loading**

- Ensure `.env` file exists in the root directory
- Check that variable names start with `VITE_`
- Restart the development server after changes

**Build Failures**

- Run `npm install` to ensure all dependencies are installed
- Check TypeScript errors with `npx tsc --noEmit`
- Clear node_modules and reinstall if needed

**Deployment Issues**

- Verify GitHub Secrets are configured correctly
- Check GitHub Actions logs for detailed errors
- Ensure main branch protections allow deployments

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 💬 Community & Support

- **Website**: [cohereboulder.org](https://cohereboulder.org)
- **Issues**: [GitHub Issues](https://github.com/Woven-Web/cohereboulder.org/issues)
- **Discussions**: Join our community conversations

## 🙏 Acknowledgments

Built with love for the Boulder regenerative community. Special thanks to all contributors and community members who make this ecosystem thrive.

---

_"Weaving the web of regenerative changemakers in Boulder"_ 🌿
