'use client';

import { useClerk } from '@clerk/nextjs';
import { BrandLogo } from '@/components/brand-logo';
import { OnboardingBrandMark } from '@/components/onboarding/onboarding-brand-mark';
import { BODY_MUTED, GHOST_PILL, PRIMARY_PILL, TITLE_FONT } from '@/lib/typography';
import { cn } from '@/lib/utils';

export default function OffboardedPage() {
  const { signOut } = useClerk();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-50/40 via-background to-orange-50/30 dark:from-orange-500/[0.04] dark:via-background dark:to-orange-500/[0.03]"
      />
      <div className="absolute left-6 top-6 z-20">
        <BrandLogo className="h-7" />
      </div>

      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
        <OnboardingBrandMark />
        <div className="mt-7 w-full max-w-xl">
          <h1 className="text-4xl tracking-tight" style={TITLE_FONT}>
            Your workspace access was removed.
          </h1>
          <p className={cn(BODY_MUTED, 'mt-3 text-base')}>
            Your brokerage administrator has ended this workspace membership.
          </p>
          <p className={cn(BODY_MUTED, 'mx-auto mt-4 max-w-md text-sm')}>
            If this was unexpected, contact your brokerage administrator. You can also
            sign out and accept an invitation to another workspace.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: '/login/realtor' })}
              className={cn(PRIMARY_PILL, 'h-10 px-6')}
            >
              Sign out
            </button>
            <a href="mailto:help@usechippi.com" className={GHOST_PILL}>
              Contact support
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
