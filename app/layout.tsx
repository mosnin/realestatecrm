import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import './globals.css';

export const metadata: Metadata = {
  title: 'WorkflowRouting — Close More Real Estate Deals',
  description: 'The CRM built for real estate agents. AI-powered pipeline management, deal tracking, and client workflows that help you close more deals faster.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider appearance={{ baseTheme: dark, variables: { colorBackground: '#0a0a0a', colorPrimary: 'white', colorInputBackground: '#141414' } }}>
      <html lang="en" className="dark">
        <body className={`${GeistSans.variable} antialiased bg-[#0a0a0a]`}>
          {children}
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
