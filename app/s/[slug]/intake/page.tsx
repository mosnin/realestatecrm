import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { buildIntakeUrl } from '@/lib/intake';
import { IntakeLinkRow } from './intake-link-row';
import { timeAgo } from '@/lib/formatting';
import { ArrowRight } from 'lucide-react';
import {
  H1,
  H3,
  TITLE_FONT,
  STAT_NUMBER_COMPACT,
  PAGE_RHYTHM,
} from '@/lib/typography';
import { AnimatedStatCell } from '@/components/motion/animated-stat-cell';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Intake Form -- ${slug} -- Chippi` };
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

  // Fetch form config status and recent submissions
  let rentalConfigured = false;
  let buyerConfigured = false;
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [formConfigResult, submissionsResult, hotLeadsResult, recentResult] =
      await Promise.all([
        supabase
          .from('SpaceSetting')
          .select('rentalFormConfig, buyerFormConfig')
          .eq('spaceId', space.id)
          .maybeSingle(),
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', space.id)
          .is('brokerageId', null)
          .contains('tags', ['application-link'])
          .gte('createdAt', thirtyDaysAgo.toISOString()),
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', space.id)
          .is('brokerageId', null)
          .contains('tags', ['application-link'])
          .eq('scoreLabel', 'hot'),
        supabase
          .from('Contact')
          .select(
            'id, name, createdAt, tags, leadScore, scoreLabel, leadType'
          )
          .eq('spaceId', space.id)
          .is('brokerageId', null)
          .contains('tags', ['application-link'])
          .order('createdAt', { ascending: false })
          .limit(5),
      ]);

    if (formConfigResult.data) {
      rentalConfigured = !!(formConfigResult.data as { rentalFormConfig?: { sections?: unknown } })
        .rentalFormConfig?.sections;
      buyerConfigured = !!(formConfigResult.data as { buyerFormConfig?: { sections?: unknown } })
        .buyerFormConfig?.sections;
    }

    totalSubmissions = submissionsResult.count ?? 0;
    hotLeadCount = hotLeadsResult.count ?? 0;
    recentLeads = (recentResult.data ?? []) as typeof recentLeads;
  } catch (err) {
    console.error('[intake/overview] DB query failed', err);
  }

  const intakeUrl = buildIntakeUrl(space.slug);
  const intakePath = `/apply/${space.slug}`;
  const anyCustom = rentalConfigured || buyerConfigured;

  return (
    <div className={`${PAGE_RHYTHM} max-w-[1120px]`}>
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Intake Form
        </h1>
        {anyCustom && (
          <Link
            href={`/s/${slug}/intake/customize`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Customize
            <ArrowRight size={13} strokeWidth={1.75} />
          </Link>
        )}
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <AnimatedStatCell
          label="Submissions (30d)"
          value={totalSubmissions}
        />
        <AnimatedStatCell
          label="Hot leads"
          value={hotLeadCount}
        />
        <StatCell
          label="Completion rate"
          value={totalSubmissions > 0 ? '100%' : '—'}
        />
      </div>

      {/* Form templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <FormStatusRow
          name="Rental Form"
          configured={rentalConfigured}
          href={`/s/${slug}/intake/customize?form=rental`}
        />
        <FormStatusRow
          name="Buyer Form"
          configured={buyerConfigured}
          href={`/s/${slug}/intake/customize?form=buyer`}
        />
      </div>

      {/* Your intake link */}
      <section className="rounded-xl border border-border/70 bg-background p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className={H3}>Your intake link</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Share this with prospects.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />
            Live
          </span>
        </div>
        <IntakeLinkRow url={intakeUrl} previewHref={intakePath} />
      </section>

      {/* Recent submissions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className={H3}>Recent submissions</h2>
          <div className="flex items-center gap-4">
            <Link
              href={`/s/${slug}/intake/analytics`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1"
            >
              View all submissions
              <ArrowRight size={12} strokeWidth={1.75} />
            </Link>
            <Link
              href={`/s/${slug}/contacts`}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1"
            >
              View as people
              <ArrowRight size={12} strokeWidth={1.75} />
            </Link>
          </div>
        </div>

        {recentLeads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No submissions yet. Share your link and they'll show up here.
          </p>
        ) : (
          <StaggerList className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70">
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
                    href={`/s/${slug}/leads`}
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
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-5">
      <p className={STAT_NUMBER_COMPACT} style={TITLE_FONT}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function FormStatusRow({
  name,
  configured,
  href,
}: {
  name: string;
  configured: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-background flex items-center justify-between gap-3 px-5 py-4 hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150"
    >
      <div>
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {configured ? 'Custom form configured' : 'Using default template'}
        </p>
      </div>
      <ArrowRight
        size={14}
        strokeWidth={1.75}
        className="text-muted-foreground/60 flex-shrink-0"
      />
    </Link>
  );
}
