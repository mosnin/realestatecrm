import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
      <SignUp forceRedirectUrl="/dashboard" />
    </div>
  );
}
