import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import Link from 'next/link';

export default function SignInPage() {
  return (
    <AuthPageLayout
      heading="Welcome back"
      subheading="Sign in to your Chippi workspace"
    >
      <div className="w-full space-y-4">
        <ThemedSignIn forceRedirectUrl="/dashboard" />
        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            href="/sign-up"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
