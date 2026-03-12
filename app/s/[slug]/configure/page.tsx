import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ConfigureAccountForm } from './configure-account-form';
import type { User, Space, SpaceSetting } from '@prisma/client';

export const metadata = { title: 'Configure your account — Chippi' };

type DbUser = User & {
  space: (Space & { settings: SpaceSetting | null }) | null;
};

export default async function ConfigurePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  const clerkUser = await currentUser();

  let dbUser: DbUser | null = null;
  try {
    dbUser = await db.user.findUnique({
      where: { clerkId: userId },
      include: { space: { include: { settings: true } } },
    });
  } catch (err) {
    console.error('[configure] DB query failed', { clerkId: userId, error: err });
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your settings. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/configure`}
            className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const initialData = {
    name: dbUser?.name ?? clerkUser?.fullName ?? clerkUser?.firstName ?? '',
    email: dbUser?.email ?? clerkUser?.emailAddresses?.[0]?.emailAddress ?? '',
    phone: dbUser?.space?.settings?.phoneNumber ?? '',
    businessName: dbUser?.space?.settings?.businessName ?? '',
    slug: dbUser?.space?.slug ?? slug,
    intakePageTitle: dbUser?.space?.settings?.intakePageTitle ?? '',
    intakePageIntro: dbUser?.space?.settings?.intakePageIntro ?? '',
    notifications: dbUser?.space?.settings?.notifications ?? true,
  };

  return <ConfigureAccountForm initialData={initialData} slug={slug} />;
}
