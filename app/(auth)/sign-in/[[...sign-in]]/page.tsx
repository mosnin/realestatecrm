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
          Are you a broker?{' '}
          <Link
            href="/login/broker"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
          >
            Brokerage login
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}

