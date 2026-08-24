import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';
import { PlanIntentCapture } from '@/components/auth/plan-intent-capture';
import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BODY_MUTED, QUIET_LINK } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { AUTH_DICTS } from '@/lib/i18n/dictionaries/auth';
import { getRequestLang } from '@/lib/i18n/request';

export const metadata: Metadata = { title: 'Sign Up — Chippi' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; redirect_url?: string }>;
}) {
  const { intent, redirect_url } = await searchParams;
  const lang = await getRequestLang();
  const copy = AUTH_DICTS[lang].signup;
  const isBroker = intent === 'broker';
  const redirectIntent = isBroker ? 'broker' : 'realtor';
  const signInBase = isBroker ? '/login/broker' : '/login/realtor';
  // Validate redirect_url: allow safe internal paths, block path traversal.
  // '/join/' lets a brokerage join-code link survive the sign-up round-trip
  // (reachable from the realtor sign-in page's "Sign up" link).
  const SAFE_PREFIXES = ['/s/', '/broker', '/admin', '/invite/', '/join/', '/subscribe', '/billing-required', '/authorize'];
  const isSafeRedirect = redirect_url
    && SAFE_PREFIXES.some(p => redirect_url.startsWith(p))
    && !redirect_url.includes('..');
  const signInUrl = isSafeRedirect
    ? `${signInBase}?redirect_url=${encodeURIComponent(redirect_url!)}`
    : signInBase;

  const postSignUpUrl = isSafeRedirect
    ? redirect_url!
    : `/auth/redirect?intent=${redirectIntent}`;

  return (
    <AuthPageLayout
      heading={copy.heading}
      subheading={copy.subheading}
      variant={isBroker ? 'broker' : 'realtor'}
      lang={lang}
    >
      {/* Stash any ?plan= from the marketing CTA before Clerk's redirects drop it. */}
      <Suspense fallback={null}>
        <PlanIntentCapture />
      </Suspense>
      <div className="w-full space-y-4">
        <ThemedSignUp
          routing="path"
          path="/sign-up"
          forceRedirectUrl={postSignUpUrl}
          signInUrl={signInUrl}
        />
        <p className={cn(BODY_MUTED, 'text-center')}>
          {copy.existing}{' '}
          <Link href={signInUrl} className={cn(QUIET_LINK, 'underline underline-offset-4')}>
            {copy.action}
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
