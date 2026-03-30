import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { GeistSans } from 'geist/font/sans';
import { Open_Sans } from 'next/font/google';

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
  display: 'swap',
});
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/theme-provider';
import { AmplitudeProvider } from '@/components/amplitude-provider';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chippi — AI-Powered CRM for Rental Agents',
  description: 'Chippi helps rental agents close leases faster with AI lead scoring, automated follow-ups, tour scheduling, and a deal pipeline built for leasing. Start your 7-day free trial.',
  keywords: ['CRM', 'real estate', 'rental agents', 'leasing', 'AI lead scoring', 'property management', 'deal pipeline', 'tour scheduling'],
  openGraph: {
    title: 'Chippi — AI-Powered CRM for Rental Agents',
    description: 'Score leads with AI, automate follow-ups, and manage your rental pipeline. Join 2,400+ agents closing leases faster with Chippi.',
    siteName: 'Chippi',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chippi — AI-Powered CRM for Rental Agents',
    description: 'Score leads with AI, automate follow-ups, and manage your rental pipeline. Join 2,400+ agents closing leases faster.',
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

  const inner = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}else{document.documentElement.classList.remove('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${GeistSans.variable} ${openSans.variable} antialiased bg-background text-foreground`}>
        <ThemeProvider>
          <AmplitudeProvider>
            {children}
          </AmplitudeProvider>
        </ThemeProvider>
        <Toaster richColors position="top-right" />
        <SpeedInsights />
      </body>
    </html>
  );

  if (isPublicPage) return inner;
  return <ClerkProvider>{inner}</ClerkProvider>;
}
