import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { GeneralSettingsForm } from './general-settings-form';
import type { SpaceSetting } from '@/lib/types';
import {
  H2,
  BODY,
  BODY_MUTED,
  PRIMARY_PILL,
  SECTION_RHYTHM,
  READING_MAX,
} from '@/lib/typography';

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
          <h2 className={H2}>Something went wrong</h2>
          <p className={BODY_MUTED}>
            We couldn&apos;t load your data. This is usually temporary.
          </p>
          <a href={`/s/${slug}/settings`} className={PRIMARY_PILL}>
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
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      <h2 className={H2}>General</h2>

      {(isTrialing || isActive) && periodEnd && (
        <div className={`rounded-md border border-border/70 bg-foreground/[0.02] px-4 py-3 ${BODY}`}>
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
        <div className={`rounded-md border border-border/70 bg-foreground/[0.02] px-4 py-3 ${BODY_MUTED}`}>
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
