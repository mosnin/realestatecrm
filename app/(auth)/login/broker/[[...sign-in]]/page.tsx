import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Broker Sign In — Chippi' };

export default function BrokerSignInPage() {
  return (
    <AuthPageLayout
      variant="broker"
      heading="Broker sign in"
      subheading="Sign in to manage your brokerage"
    >
      <ThemedSignIn
        routing="path"
        path="/login/broker"
        forceRedirectUrl="/auth/redirect?intent=broker"
        signUpUrl="/sign-up"
      />
    </AuthPageLayout>
  );
}
