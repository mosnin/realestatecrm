import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/theme-provider';
import { AmplitudeProvider } from '@/components/amplitude-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { Toaster } from '@/components/ui/sonner';
import { SentryUser } from '@/components/observability/sentry-user';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
  description: 'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current so you can focus on the deals that matter. Start your 7-day free trial.',
  keywords: ['agentic OS', 'AI agent', 'real estate', 'realtors', 'brokerages', 'AI lead scoring', 'lead qualification', 'tour scheduling', 'deal pipeline', 'CRM'],
  openGraph: {
    title: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
    description: 'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, and keeps your pipeline current.',
    siteName: 'Chippi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chippi — Agentic OS for Real Estate Agents & Brokerages',
    description: 'An AI agent that runs your realtor workspace — qualifies leads, drafts follow-ups, schedules tours, keeps your pipeline current.',
  },
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0d' },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default' as const,
    title: 'Chippi',
  },
  icons: {
    icon: '/chip-avatar.png',
    apple: '/chip-avatar.png',
    shortcut: '/chip-avatar.png',
  },
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Public-facing pages (intake, booking, status) set this header in
  // middleware so we can skip ClerkProvider entirely — prevents Clerk's
  // client-side JS from loading and prompting visitors to sign in.
  const h = await headers();
  const isPublicPage = h.get('x-public-page') === '1';

  const renderShell = (body: React.ReactNode) => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // No-flash theme. An explicit choice (localStorage 'theme') always
            // wins. When unset, the logged-out / public surface follows the OS
            // (prefers-color-scheme); the realtor dashboard keeps its light
            // default so existing users aren't surprised.
            __html: `(function(){try{var p=location.pathname;var app=/^\\/(s|broker|setup|subscribe|billing|billing-required|onboarding|admin|trial|authorize)(\\/|$)/.test(p);var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&!app&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider>
          <AmplitudeProvider>
            <MotionProvider>
              {body}
            </MotionProvider>
          </AmplitudeProvider>
        </ThemeProvider>
        <Toaster />
        <SpeedInsights />
      </body>
    </html>
  );

  if (isPublicPage) return renderShell(children);
  return (
    <ClerkProvider>
      <SentryUser />
      {renderShell(children)}
    </ClerkProvider>
  );
}
