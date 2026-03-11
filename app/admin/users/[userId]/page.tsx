import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { buildIntakeUrl } from '@/lib/intake';
import { getOnboardingStatus } from '@/lib/onboarding';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  Link2,
  Building2,
  Calendar,
  Hash,
  PhoneIncoming,
  Users,
  Briefcase,
} from 'lucide-react';
import Link from 'next/link';
import { UserActions } from './user-actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  return {
    title: `${user?.name || user?.email || 'User'} — Admin — Chippi`,
  };
}

function formatDate(date: Date | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function InfoRow({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={13} className="text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={`text-sm font-medium mt-0.5 break-all ${
            mono ? 'font-mono text-xs' : ''
          } ${!value ? 'text-muted-foreground' : ''}`}
        >
          {value || '—'}
        </p>
      </div>
    </div>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      space: {
        include: {
          settings: true,
          _count: {
            select: {
              contacts: true,
              deals: true,
              stages: true,
            },
          },
        },
      },
    },
  });

  if (!user) notFound();

  const onboarding = getOnboardingStatus(user);
  const intakeUrl = user.space ? buildIntakeUrl(user.space.slug) : null;

  // Get recent leads for this user's space
  const recentLeads = user.space
    ? await db.contact.findMany({
        where: {
          spaceId: user.space.id,
          tags: { has: 'application-link' },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          phone: true,
          createdAt: true,
          scoringStatus: true,
          scoreLabel: true,
        },
      })
    : [];

  const failedLeads = user.space
    ? await db.contact.count({
        where: {
          spaceId: user.space.id,
          scoringStatus: 'failed',
        },
      })
    : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Back to users
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
            {(user.name || user.email || '?')
              .split(' ')
              .map((n: string) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {user.name || 'No name'}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <span
          className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-1 ${
            onboarding.isOnboarded
              ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
              : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
          }`}
        >
          {onboarding.isOnboarded ? 'Onboarded' : 'Not onboarded'}
        </span>
      </div>

      {/* Account details */}
      <Card>
        <CardContent className="px-5 py-4 divide-y divide-border">
          <InfoRow icon={Mail} label="Email" value={user.email} />
          <InfoRow icon={Hash} label="Internal ID" value={user.id} mono />
          <InfoRow icon={Hash} label="Clerk ID" value={user.clerkId} mono />
          <InfoRow
            icon={Calendar}
            label="Created"
            value={formatDate(user.createdAt)}
          />
          <InfoRow
            icon={CheckCircle2}
            label="Onboarding status"
            value={
              onboarding.isOnboarded
                ? `Complete (step ${user.onboardingCurrentStep})`
                : `In progress — step ${user.onboardingCurrentStep} of 7`
            }
          />
          <InfoRow
            icon={Calendar}
            label="Onboarding started"
            value={formatDate(user.onboardingStartedAt)}
          />
          <InfoRow
            icon={Calendar}
            label="Onboarding completed"
            value={formatDate(user.onboardingCompletedAt)}
          />
        </CardContent>
      </Card>

      {/* Workspace details */}
      <div>
        <p className="text-sm font-semibold mb-3">Workspace</p>
        {user.space ? (
          <Card>
            <CardContent className="px-5 py-4 divide-y divide-border">
              <InfoRow
                icon={Building2}
                label="Name"
                value={`${user.space.emoji} ${user.space.name}`}
              />
              <InfoRow icon={Hash} label="Slug" value={user.space.slug} mono />
              {intakeUrl && (
                <InfoRow icon={Link2} label="Intake URL" value={intakeUrl} mono />
              )}
              <InfoRow
                icon={Phone}
                label="Phone"
                value={user.space.settings?.phoneNumber || null}
              />
              <InfoRow
                icon={Building2}
                label="Business name"
                value={user.space.settings?.businessName || null}
              />
              <div className="flex items-start gap-3 py-2.5">
                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Users size={13} className="text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Stats</p>
                  <div className="flex flex-wrap gap-3 mt-1">
                    <span className="text-sm">
                      <strong>{user.space._count.contacts}</strong>{' '}
                      <span className="text-muted-foreground">contacts</span>
                    </span>
                    <span className="text-sm">
                      <strong>{user.space._count.deals}</strong>{' '}
                      <span className="text-muted-foreground">deals</span>
                    </span>
                    <span className="text-sm">
                      <strong>{user.space._count.stages}</strong>{' '}
                      <span className="text-muted-foreground">stages</span>
                    </span>
                    {failedLeads > 0 && (
                      <span className="text-sm text-amber-600 dark:text-amber-400">
                        <strong>{failedLeads}</strong> failed scoring
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="px-5 py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                <XCircle size={18} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No workspace
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This user has not created a workspace yet.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent leads */}
      {user.space && (
        <div>
          <p className="text-sm font-semibold mb-3">Recent leads</p>
          {recentLeads.length === 0 ? (
            <Card>
              <CardContent className="px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <PhoneIncoming
                    size={18}
                    className="text-muted-foreground"
                  />
                </div>
                <p className="text-sm text-muted-foreground">No leads yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {lead.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lead.phone || 'No phone'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {lead.scoringStatus === 'scored' && lead.scoreLabel && (
                        <span
                          className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                            lead.scoreLabel === 'hot'
                              ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                              : lead.scoreLabel === 'warm'
                                ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                                : 'text-slate-600 bg-slate-100 dark:text-slate-400 dark:bg-slate-500/15'
                          }`}
                        >
                          {lead.scoreLabel}
                        </span>
                      )}
                      {lead.scoringStatus === 'failed' && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                          unscored
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(lead.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin actions */}
      <UserActions
        userId={user.id}
        clerkId={user.clerkId}
        email={user.email}
        isOnboarded={onboarding.isOnboarded}
        hasSpace={onboarding.hasSpace}
        intakeUrl={intakeUrl}
      />
    </div>
  );
}
