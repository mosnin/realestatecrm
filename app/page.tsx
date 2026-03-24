'use client';

import { useUser } from '@clerk/nextjs';
import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import { OnboardingFlow } from '@/components/auth/onboarding-dialog';
import Link from 'next/link';

export default function HomePage() {
  const { isSignedIn, isLoaded } = useUser();

  // Show onboarding flow inline if signed in
  const showOnboarding = isLoaded && isSignedIn;

  return (
    <AuthPageLayout
      heading={showOnboarding ? '' : 'Welcome to Chippi'}
      subheading={showOnboarding ? '' : 'Sign in to your workspace or create an account'}
    >
      {showOnboarding ? (
        /* Inline multi-step onboarding replaces the sign-in form */
        <OnboardingFlow />
      ) : (
        <div className="w-full space-y-4">
          <ThemedSignIn forceRedirectUrl="/auth/redirect?intent=realtor" />
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
      )}
    </AuthPageLayout>
  );
}
