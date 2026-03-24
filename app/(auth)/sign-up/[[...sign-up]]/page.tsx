import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign Up — Chippi' };

export default function SignUpPage() {
  return (
    <AuthPageLayout
      heading="Create your account"
      subheading="Start managing leads and clients with Chippi"
    >
      <div className="w-full space-y-4">
        <ThemedSignUp
          forceRedirectUrl="/auth/redirect?intent=realtor"
        />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/sign-in"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
