import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { buildIntakeUrl } from '@/lib/intake';
import { IntakeLinkRow } from './intake-link-row';
import { timeAgo } from '@/lib/formatting';
import { formatIntakeStatus } from '@/lib/realtor-page-status';
import { ArrowRight } from 'lucide-react';
import {
  H1,
  H3,
  TITLE_FONT,
  BODY_MUTED,
  PAGE_RHYTHM,
} from '@/lib/typography';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import type { Metadata } from 'next';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Intake -- ${slug} -- Chippi` };
}

export default async function IntakeOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let totalSubmissions = 0;
  let hotLeadCount = 0;
  let recentLeads: {
    id: string;
    name: string;
    createdAt: Date;
    tags: string[];
    leadScore: number | null;
    scoreLabel: string | null;
    leadType: string | null;
  }[] = [];

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [submissionsResult, hotLeadsResult, recentResult] = await Promise.all([
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['application-link'])
        .gte('createdAt', sevenDaysAgo.toISOString()),
      supabase
        .from('Contact')
        .select('*', { count: 'exact', head: true })
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['application-link'])
        .gte('createdAt', sevenDaysAgo.toISOString())
        .eq('scoreLabel', 'hot'),
      supabase
        .from('Contact')
        .select('id, name, createdAt, tags, leadScore, scoreLabel, leadType')
        .eq('spaceId', space.id)
        .is('brokerageId', null)
        .contains('tags', ['application-link'])
        .order('createdAt', { ascending: false })
        .limit(5),
    ]);

    totalSubmissions = submissionsResult.count ?? 0;
    hotLeadCount = hotLeadsResult.count ?? 0;
    recentLeads = (recentResult.data ?? []) as typeof recentLeads;
  } catch (err) {
    console.error('[intake/overview] DB query failed', err);
  }

  const intakeUrl = buildIntakeUrl(space.slug);
  const intakePath = `/apply/${space.slug}`;
  // 2026-05-25: `/apply/<slug>/chat` is now a permanent redirect to
  // `/apply/<slug>` — the chat is the only intake. The "AI chat mode" CTA
  // below has been hidden because it advertised a non-existent second mode
  // that just redirected to the same surface. Re-enable it only if a real
  // alternate intake variant ships again.

  // Chippi narration ladder — one sentence describing the state of intake
  // right now. No counts in stat tiles; the count lives in the sentence so
  // the realtor reads it like a thought, not a dashboard.
  const subtitle = formatIntakeStatus(totalSubmissions, hotLeadCount);
  const latestSubmission = recentLeads[0]?.createdAt
    ? timeAgo(new Date(recentLeads[0].createdAt))
    : '—';

  return (
    <SupportingPage family="intake" width="wide">
      <SupportingOrientation
        family="intake"
        eyebrow="Acquisition / Intake"
        title="Turn interest into a qualified conversation"
        summary={subtitle}
        nextAction={hotLeadCount > 0 ? `Open the ${hotLeadCount === 1 ? 'hot lead' : `${hotLeadCount} hot leads`} that arrived this week and follow up while intent is fresh.` : 'Share the live intake link where your next buyer or renter is most likely to see it.'}
        action={
          <>
            <SupportingActionLink href={intakePath}>Preview live intake</SupportingActionLink>
            <SupportingActionLink href={`/s/${slug}/intake/customize`} quiet>Customize questions</SupportingActionLink>
          </>
        }
      />

      <SupportingMetricBand>
        <SupportingMetric label="Last 7 days" value={totalSubmissions} detail="completed submissions" accent />
        <SupportingMetric label="High intent" value={hotLeadCount} detail="hot leads this week" />
        <SupportingMetric label="Latest arrival" value={latestSubmission} detail="most recent submission" />
        <SupportingMetric label="Public status" value="Live" detail={`/apply/${space.slug}`} />
      </SupportingMetricBand>

      <SupportingWorkArea className="grid gap-10 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] lg:items-start">

      {/* Your link — the one thing every realtor comes here for */}
      <section className="space-y-5 rounded-[2rem] bg-foreground p-7 text-background sm:p-9">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-background/60">Share surface</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[-0.03em]">Your live intake</h2>
            <p className="mt-2 text-sm text-background/65">
              Share it. Submissions land in People.
            </p>
          </div>
          <Link
            href={`/s/${slug}/intake/customize`}
            className="inline-flex items-center gap-1 text-sm text-background/65 hover:text-background transition-colors duration-150"
          >
            Customize
            <ArrowRight size={13} strokeWidth={1.75} />
          </Link>
        </div>
        <IntakeLinkRow url={intakeUrl} previewHref={intakePath} inverse />
      </section>

      {/* AI chat mode — hidden 2026-05-25. The `/apply/<slug>/chat` route
          now permanent-redirects to `/apply/<slug>` (which IS the chat). The
          section advertised a second "mode" that didn't exist; the share
          link above already gives the realtor the chat surface. */}

      {/* Recent submissions — the second thing they come here for */}
      <section className="min-w-0 lg:pt-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className={H3}>Recent</h2>
          {recentLeads.length > 0 && (
            <Link
              href={`/s/${slug}/contacts`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1"
            >
              All in People
              <ArrowRight size={12} strokeWidth={1.75} />
            </Link>
          )}
        </div>

        {recentLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            They&apos;ll show up here the moment someone fills it out.
          </p>
        ) : (
          <StaggerList className="chippi-dashboard-panel overflow-hidden rounded-[1.75rem] divide-y chippi-dashboard-divider px-5 sm:px-7">
            {recentLeads.map((lead) => {
              const isNew = lead.tags.includes('new-lead');
              const scoreLabel = lead.scoreLabel
                ? lead.scoreLabel.charAt(0).toUpperCase() + lead.scoreLabel.slice(1)
                : null;
              const typeLabel =
                lead.leadType === 'buyer'
                  ? 'Buyer'
                  : lead.leadType === 'rental'
                    ? 'Rental'
                    : null;
              const initials =
                lead.name
                  ?.split(' ')
                  ?.map((n: string) => n?.[0])
                  ?.join('')
                  ?.toUpperCase()
                  ?.slice(0, 2) || '??';
              return (
                <StaggerItem key={lead.id}>
                  <Link
                    href={`/s/${slug}/contacts`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.04] hover:scale-[1.005] active:bg-foreground/[0.045] transition-[colors,transform] duration-150"
                  >
                    <div className="w-9 h-9 rounded-full bg-foreground/[0.06] text-muted-foreground flex items-center justify-center text-[11px] font-medium flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {lead.name}
                        </p>
                        {isNew && (
                          <span className="inline-flex text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5 flex-shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(new Date(lead.createdAt))}
                        </span>
                        {typeLabel && (
                          <span className="inline-flex text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5">
                            {typeLabel}
                          </span>
                        )}
                        {scoreLabel && (
                          <span className="inline-flex text-[10px] text-muted-foreground border border-border/70 rounded-md px-1.5 py-0.5">
                            {scoreLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </StaggerList>
        )}
      </section>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
