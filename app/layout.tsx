import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Real Estate CRM',
  description: 'A multi-tenant real estate CRM platform.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${GeistSans.variable} antialiased`}>
          {children}
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
