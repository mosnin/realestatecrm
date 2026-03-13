import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <Link href="/">
          <BrandLogo className="h-5" alt="Chippi" />
        </Link>
        <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          Terms of Service
        </Link>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        <div className="prose prose-sm max-w-none space-y-6 text-sm text-foreground leading-relaxed">
          <section>
            <h2 className="text-base font-semibold mb-2">1. Information We Collect</h2>
            <p className="text-muted-foreground">We collect information you provide directly (name, email, workspace data) and information generated through your use of Chippi (contacts, deals, leads, and related CRM data).</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">2. How We Use Your Information</h2>
            <p className="text-muted-foreground">We use your information to provide and improve the Chippi service, send transactional notifications (such as new lead alerts when enabled), and ensure the security of your account.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">3. Data Storage and Security</h2>
            <p className="text-muted-foreground">Your data is stored securely using Supabase (PostgreSQL). We use industry-standard encryption and security practices. Authentication is handled by Clerk.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">4. Data Sharing</h2>
            <p className="text-muted-foreground">We do not sell your personal data. We may share data with trusted service providers (Supabase, Clerk, OpenAI for AI features) strictly to operate the service.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">5. Your Rights</h2>
            <p className="text-muted-foreground">You may request access to, correction of, or deletion of your personal data at any time by contacting us through your workspace settings.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">6. Cookies</h2>
            <p className="text-muted-foreground">We use cookies and similar technologies for authentication and to remember your preferences. You can control cookies through your browser settings.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">7. Changes to This Policy</h2>
            <p className="text-muted-foreground">We may update this Privacy Policy periodically. We will notify you of significant changes via email or in-app notification.</p>
          </section>
          <section>
            <h2 className="text-base font-semibold mb-2">8. Contact</h2>
            <p className="text-muted-foreground">For privacy-related questions or requests, please contact us through your workspace settings.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
