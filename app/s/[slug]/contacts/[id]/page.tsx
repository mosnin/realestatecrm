import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';
import type { Contact, ApplicationData, LeadScoreDetails, IntakeFormConfig } from '@/lib/types';
import { ContactActivityTab } from '@/components/contacts/contact-activity-tab';
import { CopyApplicantPortalLink } from '@/components/contacts/copy-applicant-portal-link';
import { ContactFollowUpField } from '@/components/contacts/contact-follow-up-field';
import { ContactLifecycleFields } from '@/components/contacts/contact-lifecycle-fields';
import { FollowUpSuggestions } from '@/components/contacts/follow-up-suggestions';
import { StageProgression } from '@/components/contacts/stage-progression';
import { RescoreButton } from '@/components/contacts/rescore-button';
import { ApplicationStatusManager } from '@/components/contacts/application-status-manager';
import { PdfExportButton } from '@/components/contacts/pdf-export-button';
import { CollapsibleSection } from '@/components/contacts/collapsible-section';
import { DynamicApplicationDisplay } from '@/components/contacts/dynamic-application-display';
import { ContactTabStrip } from '@/components/contacts/contact-tab-strip';
import { WhyThisScore } from '@/components/contacts/why-this-score';
import { formatCurrency } from '@/lib/formatting';
import { getSpaceFromSlug } from '@/lib/space';
import { AgentContactPanel } from '@/components/agent/agent-contact-panel';


function tierBadgeClasses(label: string) {
  if (label === 'hot') return 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400';
  if (label === 'warm') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400';
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { slug, id } = await params;
  const { tab } = await searchParams;

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let contact: (Contact & { dealContacts: { deal: { id: string; title: string; address: string | null; value: number | null; status: string; priority: string; stage: { name: string; color: string } } }[]; tours: { id: string; startsAt: string; endsAt: string; status: string; propertyAddress: string | null }[] }) | null = null;
  try {
    const { data: contactData, error: contactError } = await supabase.from('Contact').select('*').eq('id', id).single();
    if (contactError && contactError.code === 'PGRST116') {
      contact = null;
    } else if (contactError) {
      throw contactError;
    } else {
      const c = contactData as Contact;
      // Defence-in-depth: verify contact belongs to this workspace
      if (c.spaceId !== space.id) notFound();
      const { data: dealRows, error: dealError } = await supabase.from('DealContact').select('Deal(id, title, address, value, status, priority, DealStage(name, color))').eq('contactId', id);
      if (dealError) throw dealError;
      const { data: tourRows } = await supabase.from('Tour').select('id, guestName, startsAt, endsAt, status, propertyAddress').eq('contactId', id).order('startsAt', { ascending: false }).limit(10);
      contact = {
        ...c,
        dealContacts: ((dealRows ?? []) as unknown as { Deal: { id: string; title: string; address: string | null; value: number | null; status: string; priority: string; DealStage: { name: string; color: string } | null } }[]).map((row) => ({
          deal: {
            id: row.Deal.id,
            title: row.Deal.title,
            address: row.Deal.address,
            value: row.Deal.value,
            status: row.Deal.status ?? 'active',
            priority: row.Deal.priority ?? 'MEDIUM',
            stage: {
              name: row.Deal.DealStage?.name ?? 'Unknown',
              color: row.Deal.DealStage?.color ?? '#94a3b8',
            },
          },
        })),
        tours: (tourRows ?? []) as any[],
      };
    }
  } catch (err) {
    console.error('[contact-detail] DB query failed', { slug, id, error: err });
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">We couldn&apos;t load this contact. This is usually temporary.</p>
          <a href={`/s/${slug}/contacts`} className="inline-block px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Back to clients</a>
        </div>
      </div>
    );
  }

  if (!contact) notFound();

  const app = contact.applicationData as ApplicationData | null;
  const details = contact.scoreDetails as LeadScoreDetails | null;
  const formSnapshot = contact.formConfigSnapshot as IntakeFormConfig | null;
  const activeTab = (tab === 'overview' || tab === 'activity' || tab === 'intelligence' || tab === 'deals')
    ? tab
    : 'overview';
  const tabHref = (key: string) => `/s/${slug}/contacts/${contact.id}?tab=${key}`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header — broker-overview pattern: muted breadcrumb, serif h1,
          one-line status sentence. The contact's name IS the page. */}
      <header className="space-y-1.5">
        <Link
          href={`/s/${slug}/contacts`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={12} /> People
        </Link>
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          {contact.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {buildStatusSentence(contact, app)}
        </p>
      </header>

      {/* Stat strip — 4-cell hairline grid (broker-overview vocabulary).
          Stage / Score / Follow-up / Budget — the four numbers a realtor
          glances at before doing anything else. */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden border border-border/60 bg-border/60">
        <div className="bg-background px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Stage</p>
          <p className="text-sm font-medium mt-1 text-foreground">{stageLabel(contact.type)}</p>
        </div>
        <div className="bg-background px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Score</p>
          <p className="text-sm font-medium mt-1 text-foreground tabular-nums">
            {contact.leadScore != null ? (
              <>
                {Math.round(contact.leadScore)}
                {contact.scoreLabel && (
                  <span className="ml-1 text-xs text-muted-foreground">{contact.scoreLabel}</span>
                )}
              </>
            ) : '—'}
          </p>
        </div>
        <div className="bg-background px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Follow-up</p>
          <p className="text-sm font-medium mt-1 text-foreground">
            {contact.followUpAt
              ? new Date(String(contact.followUpAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '—'}
          </p>
        </div>
        <div className="bg-background px-4 py-3.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Budget</p>
          <p className="text-sm font-medium mt-1 text-foreground tabular-nums">
            {contact.budget != null ? formatCurrency(contact.budget) : '—'}
          </p>
        </div>
      </section>

      {/* What's next — focal action card. Lead with the answer, hide the
          taxonomy. The audit said "the realtor came here to know what to
          do next" — this card is the answer. Always renders something:
          when the AI hasn't produced a recommended action, fall back to
          a heuristic so the slot is never empty. */}
      <section className="rounded-xl border border-border/70 bg-card px-5 py-4 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          What&apos;s next
        </p>
        <p className="text-base text-foreground leading-relaxed">
          {nextStepFor(contact, app, details)}
        </p>
      </section>

      {/* Quick contact bar — email/phone/address inline, applicant portal
          tucked in. No bordered boxes — just a row. */}
      {(contact.email || contact.phone || contact.address || (contact.applicationRef && contact.statusPortalToken)) && (
        <section className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors min-w-0"
            >
              <Mail size={14} className="flex-shrink-0" />
              <span className="truncate max-w-[260px]">{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone size={14} />
              {contact.phone}
            </a>
          )}
          {contact.address && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground min-w-0">
              <MapPin size={14} className="flex-shrink-0" />
              <span className="truncate max-w-[260px]">{contact.address}</span>
            </span>
          )}
          {contact.applicationRef && contact.statusPortalToken && (
            <CopyApplicantPortalLink
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com'}/apply/${slug}/status?ref=${encodeURIComponent(contact.applicationRef)}&token=${encodeURIComponent(contact.statusPortalToken)}`}
            />
          )}
        </section>
      )}

      {/* Tab strip — sliding underline via motion.layoutId (matches the
          broker reviews + agent-activity surfaces). Old `?tab=intelligence`
          and `?tab=deals` URLs render as Overview because those views
          folded into Overview's flow. */}
      <ContactTabStrip active={activeTab} hrefFor={(k) => tabHref(k)} />

      {/* Overview — single column flow. Cards uniform: rounded-xl
          border-border/70 bg-card. */}
      {activeTab !== 'activity' && (
        <div className="space-y-6">
          <AgentContactPanel contactId={contact.id} slug={slug} contactName={contact.name} />

          {/* Pipeline stage progression */}
          <section className="rounded-xl border border-border/70 bg-card p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Pipeline
            </p>
            <div className="overflow-x-auto pb-1">
              <div className="min-w-max">
                <StageProgression contactId={contact.id} currentType={contact.type} />
              </div>
            </div>
          </section>

          {/* Score block — answer first, taxonomy hidden behind a "Why?"
              expander. The big number + tier badge + recommended action
              already lived above; this is the supporting detail. */}
          {contact.scoringStatus === 'scored' && (
            <section className="rounded-xl border border-border/70 bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-orange-500 dark:text-orange-400" />
                  <h2 className="text-sm font-semibold text-foreground">Lead score</h2>
                </div>
                <RescoreButton contactId={contact.id} />
              </div>
              <div className="px-5 py-5 space-y-4">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="text-3xl tracking-tight text-foreground tabular-nums"
                    style={{ fontFamily: 'var(--font-title)' }}
                  >
                    {contact.leadScore != null ? Math.round(contact.leadScore) : '—'}
                  </span>
                  {contact.scoreLabel && (
                    <span className={cn(
                      'inline-flex text-xs font-medium rounded-full px-2.5 py-0.5',
                      tierBadgeClasses(contact.scoreLabel),
                    )}>
                      {contact.scoreLabel}
                    </span>
                  )}
                  {details?.confidence != null && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(details.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                {contact.scoreSummary && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{contact.scoreSummary}</p>
                )}

                {/* Animated expander — replaces the native <details> so the
                    motion vocabulary stays consistent with the rest of the
                    app (chat thinking indicator, StaggerList, AnimatePresence
                    in reviews). Renders nothing when there's no taxonomy. */}
                <WhyThisScore details={details} />
              </div>
            </section>
          )}

          {/* Score-not-yet states */}
          {contact.scoringStatus === 'pending' && (
            <section className="rounded-xl border border-border/70 bg-card px-5 py-4 flex items-center gap-3">
              <Sparkles size={14} className="text-orange-500 dark:text-orange-400 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-foreground">Scoring in progress.</p>
                <p className="text-xs text-muted-foreground">Refresh in a moment.</p>
              </div>
            </section>
          )}
          {(contact.scoringStatus === 'failed' ||
            contact.scoringStatus === 'unscored' ||
            (contact.scoringStatus !== 'scored' && contact.scoringStatus !== 'pending')) && (
            <section className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Not yet scored</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {contact.scoringStatus === 'failed' ? 'Last scoring attempt failed.' : 'Run an AI score to surface insights.'}
                </p>
              </div>
              <RescoreButton contactId={contact.id} />
            </section>
          )}

          {/* Active deals — folded into Overview, no separate tab */}
          {contact.dealContacts.length > 0 && (
            <section className="rounded-xl border border-border/70 bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60">
                <h2 className="text-sm font-semibold text-foreground">Active deals</h2>
              </div>
              <ul className="divide-y divide-border/60">
                {contact.dealContacts.map(({ deal }) => (
                  <li key={deal.id}>
                    <Link
                      href={`/s/${slug}/deals/${deal.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: deal.stage.color }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{deal.title}</p>
                        {deal.address && (
                          <p className="text-xs text-muted-foreground truncate">{deal.address}</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{deal.stage.name}</span>
                      {deal.value != null && (
                        <span className="text-xs font-medium text-foreground tabular-nums">{formatCurrency(deal.value)}</span>
                      )}
                      <ExternalLink size={12} className="text-muted-foreground flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Application — when this contact came in via intake */}
          {app && (
            <section className="rounded-xl border border-border/70 bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">Application</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {app.submittedAt && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar size={11} />
                      {new Date(app.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                  <PdfExportButton contactId={contact.id} />
                </div>
              </div>
              <div className="px-5 py-3 border-b border-border/60">
                <ApplicationStatusManager
                  contactId={contact.id}
                  currentStatus={contact.applicationStatus ?? 'received'}
                  statusNote={contact.applicationStatusNote ?? null}
                />
              </div>
              {formSnapshot ? (
                <div className="px-5 py-3">
                  <DynamicApplicationDisplay
                    applicationData={app as Record<string, any>}
                    formConfigSnapshot={formSnapshot}
                    defaultOpen
                  />
                </div>
              ) : (
                <div className="px-5 py-3 divide-y divide-border/40">
                  {(app.propertyAddress || app.unitType || app.targetMoveInDate || app.monthlyRent != null || app.leaseTermPreference || app.numberOfOccupants != null) && (
                    <CollapsibleSection title="Property" defaultOpen>
                      <DetailGrid>
                        {app.propertyAddress && <Detail label="Address" value={app.propertyAddress} />}
                        {app.unitType && <Detail label="Unit type" value={app.unitType} />}
                        {app.targetMoveInDate && <Detail label="Move-in date" value={app.targetMoveInDate} />}
                        {app.monthlyRent != null && <Detail label="Monthly rent" value={typeof app.monthlyRent === 'number' ? formatCurrency(app.monthlyRent) : String(app.monthlyRent)} />}
                        {app.leaseTermPreference && <Detail label="Lease term" value={app.leaseTermPreference} />}
                        {app.numberOfOccupants != null && <Detail label="Occupants" value={String(app.numberOfOccupants)} />}
                      </DetailGrid>
                    </CollapsibleSection>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Follow-up + lifecycle controls — at the bottom because they're
              edits-on-this-record, not the realtor's daily task. */}
          <section className="rounded-xl border border-border/70 bg-card p-5 space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-up
            </p>
            <ContactFollowUpField
              contactId={contact.id}
              followUpAt={contact.followUpAt ? String(contact.followUpAt) : null}
              lastContactedAt={contact.lastContactedAt ? String(contact.lastContactedAt) : null}
            />
            <ContactLifecycleFields
              contactId={contact.id}
              initialReferralSource={contact.referralSource ?? null}
              initialSnoozedUntil={contact.snoozedUntil ? String(contact.snoozedUntil) : null}
            />
          </section>

          {/* Suggestions — quiet at the bottom for the realtor who wants
              extra prompts. Shown last because the recommended action up
              top is usually the right next move. */}
          <FollowUpSuggestions
            contactId={contact.id}
            scoreLabel={contact.scoreLabel}
            contactType={contact.type}
            hasTours={contact.tours.length > 0}
            hasDeals={contact.dealContacts.length > 0}
            hasFollowUp={!!contact.followUpAt}
          />
        </div>
      )}

      {/* Activity tab — the timeline */}
      {activeTab === 'activity' && (
        <ContactActivityTab contactId={contact.id} />
      )}
    </div>
  );
}

// ── Helpers ──

function buildStatusSentence(
  contact: { type: string; leadType: string | null; budget: number | null; sourceLabel: string | null; createdAt: string | Date },
  app: ApplicationData | null,
): string {
  const parts: string[] = [];
  parts.push(
    contact.leadType === 'buyer' ? 'Buyer' :
    contact.leadType === 'rental' ? 'Renter' :
    contact.sourceLabel ?? 'Lead',
  );
  if (contact.budget != null) {
    parts.push(`budget ${formatCurrency(contact.budget)}${contact.leadType === 'rental' ? '/mo' : ''}`);
  }
  if (app?.targetMoveInDate) {
    parts.push(`move-in ${app.targetMoveInDate}`);
  }
  parts.push(
    `added ${new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
  );
  return parts.join(' · ') + '.';
}

function stageLabel(type: string): string {
  if (type === 'QUALIFICATION') return 'Qualifying';
  if (type === 'TOUR') return 'Tour';
  if (type === 'APPLICATION') return 'Applied';
  return type;
}

/**
 * Decide the one sentence to put in the "What's next" card. Prefers the
 * AI-recommended action when it exists, otherwise picks the most pressing
 * gap from the contact record. The card never renders empty — the realtor
 * came here to know what to do next, and the answer is always something.
 */
function nextStepFor(
  contact: {
    email: string | null;
    phone: string | null;
    followUpAt: string | Date | null;
    applicationStatus: string | null;
    scoringStatus: string | null;
  },
  app: ApplicationData | null,
  details: LeadScoreDetails | null,
): string {
  if (details?.recommendedNextAction) return details.recommendedNextAction;
  if (!contact.email && !contact.phone) return 'Add a way to reach them — email or phone.';
  if (app && (contact.applicationStatus === 'received' || contact.applicationStatus == null)) {
    return 'Review their application and respond.';
  }
  if (!contact.followUpAt) return 'Set a follow-up date so they don’t go cold.';
  if (contact.scoringStatus !== 'scored') return 'Run an AI score to see what to lean on.';
  return 'Reach out and keep the momentum going.';
}
function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Detail({ label, value, span, flag }: { label: string; value: string; span?: number; flag?: boolean }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${flag ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
