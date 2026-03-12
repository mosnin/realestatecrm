import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { sql } from '@/lib/db';
import { ConfigureAccountForm } from './configure-account-form';
import type { User, Space, SpaceSetting } from '@/lib/types';

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
    const userRows = await sql`
      SELECT * FROM "User" WHERE "clerkId" = ${userId}
    `;
    if (userRows[0]) {
      const u = userRows[0] as User;
      const spaceRows = await sql`
        SELECT *, "subdomain" AS "slug" FROM "Space" WHERE "ownerId" = ${u.id} LIMIT 1
      `;
      if (spaceRows[0]) {
        const s = spaceRows[0] as Space;
        const settingsRows = await sql`
          SELECT * FROM "SpaceSetting" WHERE "spaceId" = ${s.id}
        `;
        dbUser = {
          ...u,
          space: {
            ...s,
            settings: (settingsRows[0] as SpaceSetting) ?? null,
          },
        };
      } else {
        dbUser = { ...u, space: null };
      }
    }
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
