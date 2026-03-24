import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignUp } from '@/components/auth/clerk-sign-up';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign Up — Chippi' };

export default function SignUpPage() {
  return (
    <AuthPageLayout
      heading="Create your account"
      subheading="Welcome! Please fill in the details to get started."
    >
      <div className="w-full space-y-4">
        <ThemedSignUp
          routing="path"
          path="/sign-up"
          forceRedirectUrl="/auth/redirect?intent=realtor"
          signInUrl="/login/realtor"
        />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link
            href="/login/realtor"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
