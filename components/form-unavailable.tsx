/**
 * Shown on public intake / booking pages when the realtor's subscription
 * is not active (i.e. stripeSubscriptionStatus is neither 'active' nor 'trialing').
 *
 * This is a server component — no client JS required.
 */
export function FormUnavailable({ agentName }: { agentName: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-2xl font-semibold text-gray-800">
          This form is currently unavailable
        </h1>
        <p className="mt-3 text-gray-500">
          Please contact {agentName} directly.
        </p>
      </div>
    </div>
  );
}
