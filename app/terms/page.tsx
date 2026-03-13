import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <BrandLogo className="h-5" alt="Chippi" />
        </Link>
        <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <div className="prose prose-sm max-w-none space-y-6 text-sm text-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold mb-2">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground">By accessing or using Chippi, you agree to be bound by these Terms of Service. If you do not agree, please do not use the service.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">2. Use of the Service</h2>
            <p className="text-muted-foreground">Chippi is a real estate CRM platform. You may use it only for lawful purposes and in accordance with these Terms. You are responsible for all activity under your account.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">3. Data and Privacy</h2>
            <p className="text-muted-foreground">We collect and process data as described in our Privacy Policy. By using Chippi, you consent to such processing.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">4. Intellectual Property</h2>
            <p className="text-muted-foreground">All content, features, and functionality of Chippi are the exclusive property of Chippi and its licensors. You may not copy, modify, or distribute any part of the service without written permission.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">5. Limitation of Liability</h2>
            <p className="text-muted-foreground">Chippi is provided &quot;as is&quot; without warranties of any kind. We shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">6. Changes to Terms</h2>
            <p className="text-muted-foreground">We reserve the right to modify these Terms at any time. Continued use of the service after changes constitutes acceptance of the new Terms.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">7. Contact</h2>
            <p className="text-muted-foreground">For questions about these Terms, please contact us through your workspace settings.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
