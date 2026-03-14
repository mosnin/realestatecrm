import { auth, currentUser } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ConfigureAccountForm } from './configure-account-form';
import { CreateBrokerageCard } from '@/components/broker/create-brokerage-card';
import { JoinWithCodeCard } from '@/components/broker/join-with-code-card';
import { getBrokerContext } from '@/lib/permissions';
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
    const { data: userData, error: userError } = await supabase.from('User').select('*').eq('clerkId', userId).maybeSingle();
    if (userError) throw userError;
    if (userData) {
      const u = userData as User;
      const { data: spaceData, error: spaceError } = await supabase.from('Space').select('*').eq('ownerId', u.id).limit(1).maybeSingle();
      if (spaceError) throw spaceError;
      if (spaceData) {
        const s = spaceData as Space;
        const { data: settingsData, error: settingsError } = await supabase.from('SpaceSetting').select('*').eq('spaceId', s.id).maybeSingle();
        if (settingsError) throw settingsError;
        dbUser = {
          ...u,
          space: {
            ...s,
            settings: (settingsData as SpaceSetting) ?? null,
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

  // Check broker status to show create/access brokerage card
  let existingBrokerageName: string | null = null;
  try {
    const brokerCtx = await getBrokerContext();
    existingBrokerageName = brokerCtx?.brokerage.name ?? null;
  } catch {
    // non-blocking
  }

  return (
    <div className="space-y-6">
      <ConfigureAccountForm initialData={initialData} slug={slug} />
      <div className="max-w-3xl space-y-3">
        <div>
          <p className="text-sm font-semibold">Brokerage</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create your own brokerage, or join one with an invite code from your broker.
          </p>
        </div>
        <CreateBrokerageCard existingBrokerageName={existingBrokerageName} />
        {!existingBrokerageName && <JoinWithCodeCard />}
      </div>
    </div>
  );
}
