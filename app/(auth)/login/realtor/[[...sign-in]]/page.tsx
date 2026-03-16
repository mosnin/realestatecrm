import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Realtor Sign In — Chippi' };

export default function RealtorSignInPage() {
  return (
    <AuthPageLayout
      variant="realtor"
      heading="Realtor sign in"
      subheading="Sign in to your Chippi workspace"
    >
      <ThemedSignIn
        routing="path"
        path="/login/realtor"
        forceRedirectUrl="/auth/redirect?intent=realtor"
        signUpUrl="/sign-up"
      />
    </AuthPageLayout>
  );
}
