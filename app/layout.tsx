import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/theme-provider';
import { AmplitudeProvider } from '@/components/amplitude-provider';
import { MotionProvider } from '@/components/motion/motion-provider';
import { Toaster } from '@/components/ui/sonner';
import { SentryUser } from '@/components/observability/sentry-user';
import { MarketingPixels } from '@/components/analytics/marketing-pixels';
import { isLang, LANG_TAG } from '@/lib/i18n/markets';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.usechippi.com'),
  title: 'Chippi — AI Lead Conversion Teammate for Real Estate',
  description: 'Turn more real estate leads into booked tours. Chippi reads every inquiry, ranks who is ready, drafts in your voice, books from your calendar, and keeps the CRM current.',
  keywords: ['real estate AI', 'lead conversion', 'real estate agents', 'brokerages', 'lead scoring', 'lead qualification', 'tour scheduling', 'deal follow up', 'CRM'],
  openGraph: {
    title: 'Chippi — AI Lead Conversion Teammate for Real Estate',
    description: 'Turn more real estate leads into booked tours. Chippi reads, ranks, drafts, books, and keeps your CRM current.',
    siteName: 'Chippi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chippi — AI Lead Conversion Teammate for Real Estate',
    description: 'Turn more real estate leads into booked tours. Chippi reads, ranks, drafts, books, and keeps your CRM current.',
  },
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

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0d' },
  ],
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
  const requestedLang = h.get('x-language');
  const documentLang = isLang(requestedLang) ? LANG_TAG[requestedLang] : 'en-US';

  const renderShell = (body: React.ReactNode) => (
    <html lang={documentLang} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        <MarketingPixels />
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
