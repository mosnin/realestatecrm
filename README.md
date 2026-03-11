# Chippi Real Estate CRM (Next.js Slug-Routed App)

A production-ready example of a workspace-based application built with Next.js 15, featuring custom slugs for each workspace.

## Features

- ✅ Custom slug routing with Next.js middleware
- ✅ Workspace-specific content and pages
- ✅ Shared components and layouts across workspaces
- ✅ Redis for workspace data storage
- ✅ Admin interface for managing workspaces
- ✅ Emoji support for workspace branding
- ✅ Support for local development with slugs
- ✅ Compatible with Vercel preview deployments

## Tech Stack

- [Next.js 15](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Upstash Redis](https://upstash.com/) for data storage
- [Tailwind 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for the design system

## Getting Started

### Prerequisites

- Node.js 18.17.0 or later
- pnpm (recommended) or npm/yarn
- Upstash Redis account (for production)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/vercel/platforms.git
   cd platforms
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory with:

   ```
   KV_REST_API_URL=your_redis_url
   KV_REST_API_TOKEN=your_redis_token
   ```

4. Start the development server:

   ```bash
   pnpm dev
   ```

5. Access the application:
   - Main site: http://localhost:3000
   - Admin panel: http://localhost:3000/admin
   - Workspaces: http://localhost:3000/s/[workspace-slug]

## Slug-Routed Architecture

This application uses slug-based routing where:

- Each workspace is accessed by a URL path slug (`/s/[slug]`)
- The middleware handles routing requests to the correct workspace
- Workspace data is stored in Redis using a `slug:{name}` key pattern
- The main domain hosts the landing page, admin interface, and slug-routed workspace pages
- Slugs are dynamically mapped to workspace-specific content

The middleware (`middleware.ts`) protects authenticated routes while slug lookup is handled in application data access.

## Deployment

This application is designed to be deployed on Vercel. To deploy:

1. Push your repository to GitHub
2. Connect your repository to Vercel
3. Configure environment variables
4. Deploy

For custom domains, make sure to:

1. Add your root domain to Vercel
2. Configure routing so `/s/[slug]` paths resolve to your deployment
