import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';

export default function SignInPage() {
  return (
    <AuthPageLayout
      heading="Welcome back"
      subheading="Sign in to your Chippi workspace"
    >
      <ThemedSignIn forceRedirectUrl="/dashboard" />
    </AuthPageLayout>
  );
}
