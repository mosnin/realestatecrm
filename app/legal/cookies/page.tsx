const effectiveDate = 'March 10, 2026';

export default function CookiePolicyPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Cookie Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective date: {effectiveDate}</p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">What are cookies?</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          Cookies are small files stored on your device that help websites remember preferences and improve
          performance.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">How Chippi uses cookies</h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2">
          <li>Authentication and session management.</li>
          <li>Remembering basic product preferences (such as theme).</li>
          <li>Understanding product usage patterns to improve the experience.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Managing cookies</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          You can manage cookies through your browser settings. Disabling some cookies may impact how the product
          works.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          If you have questions about this cookie policy, contact support@chippi.ai.
        </p>
      </section>
    </article>
  );
}
