import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Realtor Sign In — Chippi' };

export default async function RealtorSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  // Validate redirect_url: only allow /invite/ paths, block path traversal
  const isSafeRedirect = redirect_url?.startsWith('/invite/') && !redirect_url.includes('..');
  const postSignInUrl = isSafeRedirect
    ? redirect_url!
    : '/auth/redirect?intent=realtor';
  const signUpUrl = isSafeRedirect
    ? `/sign-up?redirect_url=${encodeURIComponent(redirect_url!)}`
    : '/sign-up';

  return (
    <AuthPageLayout
      variant="realtor"
      heading="Realtor sign in"
      subheading="Sign in to your Chippi workspace"
    >
      <div className="w-full space-y-4">
        <ThemedSignIn
          routing="path"
          path="/login/realtor"
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
