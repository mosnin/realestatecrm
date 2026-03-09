import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BrandLogo className="h-7" alt="Chippi" />
          </Link>
          <Link href="/sign-up" className="text-sm rounded-full bg-primary text-primary-foreground px-4 py-2 font-medium">
            Start free trial
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">{children}</main>
    </div>
  );
}
