import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { GeneralSettingsForm } from './general-settings-form';
import type { SpaceSetting } from '@/lib/types';

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let settings: SpaceSetting | null = null;
  try {
    const { data, error } = await supabase
      .from('SpaceSetting')
      .select('*')
      .eq('spaceId', space.id)
      .maybeSingle();
    if (error) throw error;
    settings = (data as SpaceSetting) ?? null;
  } catch (err) {
    console.error('[settings/general] DB query failed', err);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load your data. This is usually temporary.</p>
          <a href={`/s/${slug}/settings`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Try again</a>
        </div>
      </div>
    );
  }

  const subStatus = (space as any).stripeSubscriptionStatus ?? 'inactive';
  const periodEnd = (space as any).stripePeriodEnd;
  const isTrialing = subStatus === 'trialing';
  const isActive = subStatus === 'active';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Subscription status banner */}
      {(isTrialing || isActive) && periodEnd && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${isTrialing ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300' : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'}`}>
          {isTrialing ? (
            <>Trial ends on <strong>{new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>. <a href={`/s/${slug}/billing`} className="underline font-medium">Manage billing</a></>
          ) : (
            <>Subscription renews on <strong>{new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>. <a href={`/s/${slug}/billing`} className="underline font-medium">Manage billing</a></>
          )}
        </div>
      )}
      {subStatus === 'inactive' && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          No active subscription. <a href={`/s/${slug}/billing`} className="underline font-medium text-primary">Start your free trial</a>
        </div>
      )}

      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">General</h2>
        <p className="text-[13px] text-muted-foreground">Workspace name, slug, and contact information</p>
      </div>
      <GeneralSettingsForm space={space} settings={settings} />
    </div>
  );
}
