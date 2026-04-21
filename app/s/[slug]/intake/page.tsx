import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { buildIntakeUrl } from '@/lib/intake';
import { Card, CardContent } from '@/components/ui/card';
import { CopyLinkButton } from '../copy-link-button';
import { timeAgo } from '@/lib/formatting';
import {
  ClipboardList,
  Pencil,
  Share2,
  ArrowRight,
  ExternalLink,
  PhoneIncoming,
  TrendingUp,
  Flame,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
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
      rentalConfigured = !!(formConfigResult.data as any).rentalFormConfig
        ?.sections;
      buyerConfigured = !!(formConfigResult.data as any).buyerFormConfig
        ?.sections;
    }

    totalSubmissions = submissionsResult.count ?? 0;
    hotLeadCount = hotLeadsResult.count ?? 0;
    recentLeads = (recentResult.data ?? []) as typeof recentLeads;
  } catch (err) {
    console.error('[intake/overview] DB query failed', err);
  }

  const intakeUrl = buildIntakeUrl(space.slug);

  return (
    <div className="space-y-8 max-w-[1120px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Intake Form
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your intake forms, track submissions, and share your link
            with prospective clients.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/s/${slug}/intake/customize`}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Pencil size={14} />
            Customize Form
          </Link>
          <Link
            href={`/s/${slug}/intake/share`}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-md border border-border bg-card hover:bg-muted transition-colors"
          >
            <Share2 size={14} />
            Share
          </Link>
        </div>
      </div>

      {/* Form status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                <ClipboardList
                  size={18}
                  className="text-orange-600 dark:text-orange-400"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Rental Form</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {rentalConfigured ? (
                    <>
                      <CheckCircle2
                        size={13}
                        className="text-emerald-500 flex-shrink-0"
                      />
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        Custom form configured
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2
                        size={13}
                        className="text-blue-500 flex-shrink-0"
                      />
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        Using default template
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <ClipboardList
                  size={18}
                  className="text-blue-600 dark:text-blue-400"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Buyer Form</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {buyerConfigured ? (
                    <>
                      <CheckCircle2
                        size={13}
                        className="text-emerald-500 flex-shrink-0"
                      />
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">
                        Custom form configured
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2
                        size={13}
                        className="text-blue-500 flex-shrink-0"
                      />
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        Using default template
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <PhoneIncoming size={16} className="text-muted-foreground" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {totalSubmissions}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Submissions (last 30 days)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <Flame size={16} className="text-muted-foreground" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">
              {hotLeadCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hot leads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <TrendingUp size={16} className="text-muted-foreground" />
              </div>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {totalSubmissions > 0 ? `${Math.min(100, Math.round((totalSubmissions / Math.max(totalSubmissions, 1)) * 100))}%` : '--'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Completion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Your intake link */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Share2 size={16} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-tight">
                Your intake link
              </p>
              <p className="text-xs text-muted-foreground">
                Share this with prospective clients
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2.5 py-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted rounded-lg px-3 py-2 font-mono text-muted-foreground border border-border/60 break-all line-clamp-2 sm:line-clamp-1">
              {intakeUrl}
            </code>
            <CopyLinkButton url={intakeUrl} />
            <a
              href={`/apply/${space.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex-shrink-0"
            >
              <ExternalLink size={13} />
              <span className="hidden sm:inline">Preview</span>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Recent submissions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            Recent submissions
          </h2>
          <Link
            href={`/s/${slug}/leads`}
            className="text-xs text-primary font-medium hover:underline underline-offset-2 flex items-center gap-1"
          >
            View all leads <ArrowRight size={12} />
          </Link>
        </div>

        {recentLeads.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <PhoneIncoming
                  size={20}
                  className="text-muted-foreground"
                />
              </div>
              <p className="text-sm font-medium text-foreground">
                No submissions yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
                Share your intake link to start receiving applications from
                prospective clients.
              </p>
              <Link
                href={`/s/${slug}/intake/share`}
                className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline mt-3"
              >
                Share your link <ArrowRight size={12} />
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {recentLeads.map((lead) => {
                const isNew = lead.tags.includes('new-lead');
                const scoreBadge =
                  lead.scoreLabel === 'hot'
                    ? {
                        label: 'Hot',
                        cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                      }
                    : lead.scoreLabel === 'warm'
                      ? {
                          label: 'Warm',
                          cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                        }
                      : lead.scoreLabel === 'cold'
                        ? {
                            label: 'Cold',
                            cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400',
                          }
                        : null;

                const typeBadge =
                  lead.leadType === 'buyer'
                    ? {
                        label: 'Buyer',
                        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                      }
                    : lead.leadType === 'rental'
                      ? {
                          label: 'Rental',
                          cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
                        }
                      : null;

                return (
                  <Link
                    key={lead.id}
                    href={`/s/${slug}/leads`}
                    className="block"
                  >
                    <div
                      className={`flex items-center gap-3 px-5 py-3.5 hover:bg-muted/40 transition-colors ${isNew ? 'bg-primary/[0.03]' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                        {lead.name
                          ?.split(' ')
                          ?.map((n: string) => n?.[0])
                          ?.join('')
                          ?.toUpperCase()
                          ?.slice(0, 2) || '??'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">
                            {lead.name}
                          </p>
                          {isNew && (
                            <span className="inline-flex text-[10px] font-semibold text-primary bg-primary/10 rounded-md px-1.5 py-0.5 flex-shrink-0">
                              New
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {timeAgo(new Date(lead.createdAt))}
                          </span>
                          {scoreBadge && (
                            <span
                              className={`inline-flex text-[10px] font-semibold rounded-md px-1.5 py-0.5 ${scoreBadge.cls}`}
                            >
                              {scoreBadge.label}
                            </span>
                          )}
                          {typeBadge && (
                            <span
                              className={`inline-flex text-[10px] font-semibold rounded-md px-1.5 py-0.5 ${typeBadge.cls}`}
                            >
                              {typeBadge.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
