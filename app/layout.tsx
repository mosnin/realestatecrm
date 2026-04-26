import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/theme-provider';
import { AmplitudeProvider } from '@/components/amplitude-provider';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chippi — AI-Powered CRM for Real Estate Agents',
  description: 'Chippi helps real estate agents close deals faster with AI lead scoring, automated follow-ups, tour scheduling, and a deal pipeline built for how realtors work. Start your 7-day free trial.',
  keywords: ['CRM', 'real estate', 'realtors', 'AI lead scoring', 'property management', 'deal pipeline', 'tour scheduling', 'brokerages'],
  openGraph: {
    title: 'Chippi — AI-Powered CRM for Real Estate Agents',
    description: 'Score leads with AI, automate follow-ups, and manage your pipeline. Join agents closing deals faster with Chippi.',
    siteName: 'Chippi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chippi — AI-Powered CRM for Real Estate Agents',
    description: 'Score leads with AI, automate follow-ups, and manage your pipeline. Join agents closing deals faster.',
  },
  icons: {
    icon: '/chip-avatar.png',
    apple: '/chip-avatar.png',
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
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider>
          <AmplitudeProvider>
            {body}
          </AmplitudeProvider>
        </ThemeProvider>
        <Toaster richColors position="top-right" />
        <SpeedInsights />
      </body>
    </html>
  );

  if (isPublicPage) return renderShell(children);
  return <ClerkProvider>{renderShell(children)}</ClerkProvider>;
}
