import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { OnboardingWizard } from './wizard';

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerk = await currentUser();
  const email = clerk?.emailAddresses?.[0]?.emailAddress ?? '';

  const user = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      space: { include: { settings: true } }
    }
  });

  if (user?.onboardingCompletedAt && user.space) {
    redirect(`/s/${user.space.subdomain}`);
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl">
        <OnboardingWizard
          initialStep={Math.max(1, Math.min(user?.onboardingCurrentStep ?? 1, 7))}
          initialProfile={{
            fullName: user?.name ?? clerk?.fullName ?? clerk?.firstName ?? '',
            businessName: user?.businessName ?? '',
            email: user?.email ?? email,
            phone: user?.phone ?? ''
          }}
          initialWorkspace={{
            slug: user?.space?.subdomain ?? '',
            displayTitle: user?.space?.intakeDisplayTitle ?? user?.space?.name ?? user?.businessName ?? '',
            introLine:
              user?.space?.intakeIntroLine ??
              'Complete this quick application so we can review your fit and follow up fast.'
          }}
          initialNotifications={user?.space?.settings?.notifications ?? true}
        />
      </div>
    </div>
  );
}
