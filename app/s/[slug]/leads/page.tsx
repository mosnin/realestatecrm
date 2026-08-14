import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getSpaceFromSlug, getSpaceForUser } from '@/lib/space';
import { ArrowRight, Inbox, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import type { Contact } from '@/lib/types';
import { LeadsView } from '@/components/leads/leads-view';
import { PeopleTabs } from '@/components/people/people-tabs';
import { H1, H3, BODY_MUTED, TITLE_FONT, SECTION_LABEL, PRIMARY_PILL } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { Reveal, SplitReveal } from '@/components/motion';

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) redirect('/');

  // Verify the authenticated user owns this space
  const userSpace = await getSpaceForUser(userId);
  if (!userSpace || userSpace.id !== space.id) redirect('/');

  let leads: Contact[] = [];
  try {
    const { data, error } = await supabase
      .from('Contact')
      .select('*')
      .eq('spaceId', space.id)
      .is('brokerageId', null) // Exclude brokerage leads
      .contains('tags', ['application-link'])
      .order('createdAt', { ascending: false })
      .limit(500);
    if (error) throw error;
    leads = (data ?? []) as Contact[];
  } catch (err) {
    console.error('[leads] DB query failed', { slug, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.04]">
            <Inbox size={20} strokeWidth={1.5} className="text-muted-foreground/60" />
          </div>
          <h1 className={H3}>Your leads didn&apos;t load</h1>
          <p className={cn(BODY_MUTED, 'mt-1.5')}>
            Something glitched on the way in. No leads were lost — this is almost
            always a passing thing.
          </p>
          <a
            href={`/s/${slug}/leads`}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 h-9 text-sm font-medium text-background transition-all duration-150 hover:bg-foreground/90 active:scale-[0.98]"
          >
            <RotateCcw size={14} />
            Try again
          </a>
        </div>
      </div>
    );
  }

  // Mark new leads as read (clear new-lead tag). One UPDATE per row — the
  // existing tags differ between rows, so a single bulk update with one value
  // would clobber them. Still cheap at ≤500 rows. Logged loudly so a silent
  // failure mode (DB write fails, badge stays forever) gets caught.
  const unreadLeads = leads.filter((lead) => lead.tags.includes('new-lead'));
  if (unreadLeads.length) {
    try {
      await Promise.all(
        unreadLeads.map((lead) => {
          const newTags = (lead.tags ?? []).filter((t: string) => t !== 'new-lead');
          return supabase
            .from('Contact')
            .update({ tags: newTags, updatedAt: new Date().toISOString() })
            .eq('id', lead.id)
            .eq('spaceId', space.id);
        }),
      );
    } catch (err) {
      console.error('[leads] failed to clear new-lead tags', {
        spaceId: space.id,
        count: unreadLeads.length,
        error: err,
      });
    }
  }

  const newLeadIds = new Set(unreadLeads.map((l) => l.id));

  // Tier counts (server-side, for summary bar)
  const tierCounts = {
    hot: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'hot').length,
    warm: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'warm').length,
    cold: leads.filter((l) => l.scoringStatus === 'scored' && l.scoreLabel === 'cold').length,
    unscored: leads.filter((l) => l.scoringStatus !== 'scored' || !l.scoreLabel).length,
  };

  const priorityCount = tierCounts.hot + tierCounts.warm;

  return (
    <div
      className="chippi-dashboard-canvas mx-auto max-w-6xl space-y-8 pb-12 pt-3 sm:pt-5"
      data-page-family="lead-intake"
    >
      {/* Intake is a triage desk: outcome statement on the left, live intake
          number and the primary distribution action on the right. */}
      <header className="grid gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end lg:gap-16">
        <div className="max-w-2xl space-y-3">
          <p className={SECTION_LABEL}>Lead intake</p>
          <h1 className={cn(H1, 'max-w-xl text-[2.75rem] leading-[.98] sm:text-[4rem]')} style={TITLE_FONT}>
            <SplitReveal as="span" text="Turn interest into a first conversation." />
          </h1>
          <p className={BODY_MUTED}>
            {leads.length === 0
              ? 'Share your intake link and every new application will land here, scored and ready to work.'
              : unreadLeads.length > 0
                ? `${unreadLeads.length} new ${unreadLeads.length === 1 ? 'application needs' : 'applications need'} a first look.`
                : 'Every new application has been seen. Keep the best opportunities moving.'}
          </p>
        </div>
        <div className="flex items-end justify-between gap-6 lg:flex-col lg:items-end">
          <div className="flex items-end gap-2 lg:text-right">
            <span className="text-[5rem] leading-[.78] tracking-[-0.06em] tabular-nums sm:text-[6rem]" style={TITLE_FONT}>
              {leads.length}
            </span>
            <span className="pb-1.5 text-sm text-muted-foreground">in intake</span>
          </div>
          <Link href={`/s/${slug}/intake`} className={PRIMARY_PILL}>
            Share intake link
          </Link>
        </div>
      </header>

      <PeopleTabs slug={slug} newCount={unreadLeads.length} />

      {/* A flat triage ledger belongs to intake. It is deliberately not the
          three-cell card strip used by Today or the relationship directory. */}
      {leads.length > 0 && (
        <Reveal
          variant="fade"
          className="grid grid-cols-2 border-y border-border/60 sm:grid-cols-4"
          data-lead-orientation="triage-summary"
        >
          {[
            ['Ready to call', priorityCount],
            ['New', unreadLeads.length],
            ['Hot', tierCounts.hot],
            ['Needs scoring', tierCounts.unscored],
          ].map(([label, value], index) => (
            <div
              key={String(label)}
              className={cn(
                'min-w-0 py-5 pr-4 sm:px-5 sm:first:pl-0 sm:last:pr-0',
                index % 2 === 1 && 'border-l border-border/60 pl-4',
                index > 1 && 'border-t border-border/60 sm:border-t-0',
                index > 0 && 'sm:border-l sm:border-border/60',
              )}
            >
              <p className={SECTION_LABEL}>{label}</p>
              <p className="mt-3 text-[2.35rem] leading-none tracking-[-0.04em] tabular-nums" style={TITLE_FONT}>
                {value}
              </p>
            </div>
          ))}
        </Reveal>
      )}

      {leads.length === 0 ? (
        <Reveal variant="rise" className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
          <p className="text-sm text-foreground">No applications yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Share your intake link — new applications will appear here.
          </p>
          <Link
            href={`/s/${slug}/intake`}
            className="inline-flex items-center gap-1.5 mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Get your intake link <ArrowRight size={12} />
          </Link>
        </Reveal>
      ) : (
        <Suspense
          fallback={
            <div className="rounded-xl border border-border/70 divide-y divide-border/60 overflow-hidden animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-1/2 bg-muted rounded" />
                    <div className="h-2.5 w-1/3 bg-muted/70 rounded" />
                  </div>
                  <div className="h-5 w-14 bg-muted/70 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          }
        >
          <LeadsView leads={leads} slug={slug} newLeadIds={newLeadIds} />
        </Suspense>
      )}
    </div>
  );
}
