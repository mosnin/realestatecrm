'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { OnboardingFlow } from '@/components/auth/onboarding-dialog';

export default function HomePage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();

  // Redirect unauthenticated users to the proper sign-in page
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/login/realtor');
    }
  }, [isLoaded, isSignedIn, router]);

  // Show onboarding flow inline if signed in
  if (isLoaded && isSignedIn) {
    return (
      <AuthPageLayout heading="" subheading="">
        <OnboardingFlow />
      </AuthPageLayout>
    );
  }

  // Loading state while Clerk initializes
  return (
    <AuthPageLayout heading="" subheading="">
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    </AuthPageLayout>
  );
}
