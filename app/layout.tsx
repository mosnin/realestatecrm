import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
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
    <ClerkProvider>
      <html lang="en" className="dark" suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})();`,
            }}
          />
        </head>
        <body className={`${GeistSans.variable} antialiased bg-background text-foreground`}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
          <Toaster richColors position="top-right" />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
