import { SignUp } from '@clerk/nextjs';
import { AuthPageLayout } from '@/components/auth/auth-page-layout';

export default function SignUpPage() {
  return (
    <AuthPageLayout
      heading="Create your account"
      subheading="Start managing leads and clients with Chippi"
    >
      <SignUp
        forceRedirectUrl="/dashboard"
        afterSignUpUrl="/dashboard"
        signUpForceRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: '#0d9488',
            colorBackground: 'transparent',
            borderRadius: '0.5rem',
            fontFamily: 'var(--font-geist-sans)',
          },
          elements: {
            rootBox: 'w-full',
            card: 'shadow-none bg-transparent border-0 p-0 w-full gap-5',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            header: 'hidden',
            socialButtonsBlockButton:
              'border border-border bg-card hover:bg-accent text-foreground font-medium',
            socialButtonsBlockButtonText: 'font-medium',
            dividerLine: 'bg-border',
            dividerText: 'text-muted-foreground text-xs',
            formFieldLabel: 'text-sm font-medium text-foreground',
            formFieldInput:
              'border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-primary',
            formButtonPrimary:
              'bg-primary hover:bg-primary/90 text-primary-foreground font-medium',
            footerActionText: 'text-muted-foreground text-sm',
            footerActionLink: 'text-primary hover:text-primary/80 font-medium',
            identityPreviewText: 'text-foreground',
            identityPreviewEditButton: 'text-primary',
            alertText: 'text-sm',
            formFieldErrorText: 'text-destructive text-xs',
          },
        }}
      />
    </AuthPageLayout>
  );
}
