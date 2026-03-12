import { SignUp } from '@clerk/nextjs';
import { BrandLogo } from '@/components/brand-logo';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6">
        <BrandLogo className="h-10" alt="Chippi" />
        <SignUp forceRedirectUrl="/dashboard" afterSignUpUrl="/dashboard" signUpForceRedirectUrl="/dashboard" />
      </div>
    </div>
  );
}
