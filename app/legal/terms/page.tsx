const effectiveDate = 'March 10, 2026';

export default function TermsPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective date: {effectiveDate}</p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">Overview</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          These terms govern your use of Chippi. By using Chippi, you agree to these terms.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Using the service</h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2">
          <li>You are responsible for your account and activity.</li>
          <li>You agree to use Chippi lawfully and not misuse the service.</li>
          <li>You are responsible for the content and lead data you collect.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Subscriptions and billing</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          Paid plans are billed on a recurring basis. You can cancel before renewal to avoid future charges.
          Trial availability and pricing may change in the future.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Availability</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          We aim for reliable uptime but do not guarantee uninterrupted service. We may modify or improve features
          over time.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Limitation of liability</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          Chippi is provided on an “as is” basis to the extent allowed by law. We are not liable for indirect,
          incidental, or consequential damages.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          Questions about these terms can be sent to support@chippi.ai.
        </p>
      </section>
    </article>
  );
}
