import { SignIn } from '@clerk/nextjs';
import { BrandLogo } from '@/components/brand-logo';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6">
        <BrandLogo className="h-10" alt="Chippi" />
        <SignIn forceRedirectUrl="/dashboard" />
      </div>
    </div>
  );
}
