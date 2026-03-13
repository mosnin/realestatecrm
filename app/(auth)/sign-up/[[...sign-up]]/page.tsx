import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';

export default function SignUpPage() {
  return (
    <AuthPageLayout
      heading="Create your account"
      subheading="Start managing leads and clients with Chippi"
    >
      <ThemedSignUp
        forceRedirectUrl="/dashboard"
        afterSignUpUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
      />
    </AuthPageLayout>
  );
}
