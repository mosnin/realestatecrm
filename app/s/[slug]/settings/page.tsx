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
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-center space-y-3 p-8">
          <h2
            className="text-2xl tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-title)' }}
          >
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground">
            We couldn&apos;t load your data. This is usually temporary.
          </p>
          <a
            href={`/s/${slug}/settings`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-sm font-medium hover:bg-foreground/90 active:scale-[0.98] transition-all duration-150"
          >
            Try again
          </a>
        </div>
      </div>
    );
  }

  const subStatus = (space as { stripeSubscriptionStatus?: string }).stripeSubscriptionStatus ?? 'inactive';
  const periodEnd = (space as { stripePeriodEnd?: string }).stripePeriodEnd;
  const isTrialing = subStatus === 'trialing';
  const isActive = subStatus === 'active';

  return (
    <div className="space-y-8 max-w-3xl">
      <h2
        className="text-2xl tracking-tight text-foreground"
        style={{ fontFamily: 'var(--font-title)' }}
      >
        General
      </h2>

      {(isTrialing || isActive) && periodEnd && (
        <div className="rounded-md border border-border/70 bg-foreground/[0.02] px-4 py-3 text-sm text-foreground">
          {isTrialing ? (
            <>
              Trial ends on{' '}
              <strong className="font-medium">
                {new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </strong>
              .{' '}
              <a href={`/s/${slug}/billing`} className="underline underline-offset-2 hover:text-foreground/80">
                Manage billing
              </a>
            </>
          ) : (
            <>
              Subscription renews on{' '}
              <strong className="font-medium">
                {new Date(periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </strong>
              .{' '}
              <a href={`/s/${slug}/billing`} className="underline underline-offset-2 hover:text-foreground/80">
                Manage billing
              </a>
            </>
          )}
        </div>
      )}
      {subStatus === 'inactive' && (
        <div className="rounded-md border border-border/70 bg-foreground/[0.02] px-4 py-3 text-sm text-muted-foreground">
          No active subscription.{' '}
          <a href={`/s/${slug}/billing`} className="underline underline-offset-2 text-foreground hover:text-foreground/80">
            Start your free trial
          </a>
        </div>
      )}

      <GeneralSettingsForm space={space} settings={settings} />
    </div>
  );
}
