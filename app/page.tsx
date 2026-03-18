import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import { OnboardingDialog } from '@/components/auth/onboarding-dialog';
import Link from 'next/link';

export default function HomePage() {
  return (
    <AuthPageLayout
      heading="Welcome to Chippi"
      subheading="Sign in to your workspace or create an account"
    >
      <div className="w-full space-y-4">
        <ThemedSignIn forceRedirectUrl="/" />
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <p>
            Are you a broker?{' '}
            <Link
              href="/login/broker"
              className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
            >
              Brokerage login
            </Link>
          </p>
        </div>
      </div>

      {/* Onboarding popup — shows after sign-in if user has no workspace */}
      <OnboardingDialog />
    </AuthPageLayout>
  );
}
