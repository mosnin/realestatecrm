const effectiveDate = 'March 10, 2026';

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective date: {effectiveDate}</p>
      </header>

      <section className="space-y-3 text-sm leading-6 text-muted-foreground">
        <p>
          Chippi helps realtors manage leasing leads. This policy explains what information we collect,
          how we use it, and your choices.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Information we collect</h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2">
          <li>Account details such as name, email, and login identifiers.</li>
          <li>Lead intake data you collect through your forms and workflows.</li>
          <li>Basic product usage data to help us improve performance and reliability.</li>
          <li>Billing and subscription information handled by our payment providers.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">How we use information</h2>
        <ul className="mt-3 list-disc pl-5 text-sm text-muted-foreground space-y-2">
          <li>Provide and operate the product.</li>
          <li>Support lead qualification, scoring assistance, and follow-up workflows.</li>
          <li>Secure accounts, detect abuse, and maintain system integrity.</li>
          <li>Communicate product updates and support responses.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Data sharing</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          We do not sell your personal data. We may share data with service providers that help us run Chippi,
          including hosting, analytics, authentication, and billing partners.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Retention and security</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          We retain information for as long as needed to provide the service and meet legal obligations. We use
          reasonable safeguards to protect data, but no method is 100% secure.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Your choices</h2>
        <p className="mt-3 text-sm text-muted-foreground leading-6">
          You can request access, updates, or deletion of your account data by contacting
          support@chippi.ai.
        </p>
      </section>
    </article>
  );
}
