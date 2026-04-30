import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/formatting';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import {
  H1,
  H3,
  TITLE_FONT,
  STAT_NUMBER_COMPACT,
  PAGE_RHYTHM,
} from '@/lib/typography';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Submissions -- ${slug} -- Chippi` };
}

export default async function IntakeAnalyticsPage({
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
  let warmLeadCount = 0;
  let buyerCount = 0;
  let submissions: {
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

    const [totalResult, hotResult, warmResult, buyerResult, listResult] =
      await Promise.all([
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
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', space.id)
          .is('brokerageId', null)
          .contains('tags', ['application-link'])
          .eq('scoreLabel', 'warm'),
        supabase
          .from('Contact')
          .select('*', { count: 'exact', head: true })
          .eq('spaceId', space.id)
          .is('brokerageId', null)
          .contains('tags', ['application-link'])
          .eq('leadType', 'buyer'),
        supabase
          .from('Contact')
          .select(
            'id, name, createdAt, tags, leadScore, scoreLabel, leadType',
          )
          .eq('spaceId', space.id)
          .is('brokerageId', null)
          .contains('tags', ['application-link'])
          .order('createdAt', { ascending: false })
          .limit(50),
      ]);

    totalSubmissions = totalResult.count ?? 0;
    hotLeadCount = hotResult.count ?? 0;
    warmLeadCount = warmResult.count ?? 0;
    buyerCount = buyerResult.count ?? 0;
    submissions = (listResult.data ?? []) as typeof submissions;
  } catch (err) {
    console.error('[intake/analytics] DB query failed', err);
  }

  return (
    <div className={`${PAGE_RHYTHM} max-w-[1120px]`}>
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <h1 className={H1} style={TITLE_FONT}>
          Submissions
        </h1>
        <Link
          href={`/s/${slug}/intake`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Overview
        </Link>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
        <StatCell label="Submissions (30d)" value={String(totalSubmissions)} />
        <StatCell label="Hot leads" value={String(hotLeadCount)} />
        <StatCell label="Warm leads" value={String(warmLeadCount)} />
        <StatCell label="Buyers" value={String(buyerCount)} />
      </div>

      {/* Submissions list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className={H3}>All submissions</h2>
          <Link
            href={`/s/${slug}/leads`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 inline-flex items-center gap-1"
          >
            Open in leads
            <ArrowRight size={12} strokeWidth={1.75} />
          </Link>
        </div>

        {submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No submissions yet — share your link.
          </p>
        ) : (
          <div className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70">
            {submissions.map((lead) => {
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
                <Link
                  key={lead.id}
                  href={`/s/${slug}/leads`}
                  className="flex items-center gap-3 px-5 py-3.5 hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150"
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
              );
            })}
          </div>
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
