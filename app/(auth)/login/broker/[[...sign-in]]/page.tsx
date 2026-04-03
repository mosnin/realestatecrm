import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Broker Sign In — Chippi' };

export default async function BrokerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const safeInviteRedirect = redirect_url?.startsWith('/invite/')
    ? redirect_url
    : null;
  const postSignInUrl = safeInviteRedirect ?? '/auth/redirect?intent=broker';
  const signUpUrl = safeInviteRedirect
    ? `/sign-up?intent=broker&redirect_url=${encodeURIComponent(safeInviteRedirect)}`
    : '/sign-up?intent=broker';

  return (
    <AuthPageLayout
      variant="broker"
      heading="Broker sign in"
      subheading="Sign in to manage your brokerage"
    >
      <div className="w-full space-y-4">
        <ThemedSignIn
          routing="path"
          path="/login/broker"
          forceRedirectUrl={postSignInUrl}
          signUpUrl={signUpUrl}
        />
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href={signUpUrl}
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
