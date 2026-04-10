import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign Up — Chippi' };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string; redirect_url?: string }>;
}) {
  const { intent, redirect_url } = await searchParams;
  const isBroker = intent === 'broker';
  const redirectIntent = isBroker ? 'broker' : 'realtor';
  const signInBase = isBroker ? '/login/broker' : '/login/realtor';
  // Validate redirect_url: allow safe internal paths, block path traversal
  const SAFE_PREFIXES = ['/s/', '/broker', '/admin', '/invite/', '/subscribe', '/billing-required', '/authorize'];
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
      heading="Create your account"
      subheading="Welcome! Please fill in the details to get started."
      variant={isBroker ? 'broker' : 'realtor'}
    >
      <div className="w-full space-y-4">
        <ThemedSignUp
          routing="path"
          path="/sign-up"
          forceRedirectUrl={postSignUpUrl}
          signInUrl={signInUrl}
        />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href={signInUrl}
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
