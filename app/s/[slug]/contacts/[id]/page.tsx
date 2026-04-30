import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { safeHref } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  ExternalLink,
  Briefcase,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  Info,
  Calendar,
  CalendarDays,
  CalendarPlus,
  ShieldCheck,
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
import { getInitials, formatCurrency } from '@/lib/formatting';
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
    <div className="space-y-4 max-w-[1400px]">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/s/${slug}/contacts`} className="text-muted-foreground hover:text-foreground">Contacts</Link>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold">{contact.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/s/${slug}/contacts`}>
                <ArrowLeft size={14} className="mr-1" /> Back
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href={`/s/${slug}/deals`}>Create Deal</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="border-b lg:border-b-0 lg:border-r border-border p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
                {getInitials(contact.name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl tracking-tight font-semibold text-foreground leading-tight truncate">{contact.name}</h1>
                <p className="text-sm text-muted-foreground truncate">{contact.sourceLabel ?? 'Intake lead'}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Added {new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link href={`/s/${slug}/calendar`} className="inline-flex items-center justify-center gap-1 text-xs rounded-md border border-border py-2 hover:bg-muted transition-colors"><CalendarPlus size={12} /> Task</Link>
              <Link href={`/s/${slug}/deals`} className="inline-flex items-center justify-center gap-1 text-xs rounded-md border border-border py-2 hover:bg-muted transition-colors"><Briefcase size={12} /> Deal</Link>
            </div>

            {/* Applicant portal — quiet share affordance. Only renders when
                this contact actually has an applicant portal (came in via
                the intake form), keyed off applicationRef + statusPortalToken.
                URL points at the existing /apply/[slug]/status portal. */}
            {contact.applicationRef && contact.statusPortalToken && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Applicant portal</p>
                  <span className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
                    Live
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {contact.name.split(' ')[0]} can see status, message you, and request tours here.
                </p>
                <CopyApplicantPortalLink
                  url={`${process.env.NEXT_PUBLIC_APP_URL ?? 'https://my.usechippi.com'}/apply/${slug}/status?ref=${encodeURIComponent(contact.applicationRef)}&token=${encodeURIComponent(contact.statusPortalToken)}`}
                />
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Contact details</p>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="block text-sm text-primary hover:underline break-all">{contact.email}</a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="block text-sm text-primary hover:underline">{contact.phone}</a>
              )}
              {contact.address && <p className="text-sm text-muted-foreground">{contact.address}</p>}
              <ContactFollowUpField
                contactId={contact.id}
                followUpAt={contact.followUpAt ? String(contact.followUpAt) : null}
                lastContactedAt={contact.lastContactedAt ? String(contact.lastContactedAt) : null}
              />
            </div>

            <ContactLifecycleFields
              contactId={contact.id}
              initialReferralSource={contact.referralSource ?? null}
              initialSnoozedUntil={contact.snoozedUntil ? String(contact.snoozedUntil) : null}
            />

            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-semibold">Pipeline stage</p>
              <div className="max-w-full overflow-x-auto pb-1">
                <div className="min-w-max">
                  <StageProgression contactId={contact.id} currentType={contact.type} />
                </div>
              </div>
            </div>
          </aside>

          <main className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-5 text-sm border-b border-border pb-2 overflow-x-auto">
              <Link href={tabHref('overview')} className={`${activeTab === 'overview' ? 'font-medium border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'} pb-2 whitespace-nowrap`}>Overview</Link>
              <Link href={tabHref('activity')} className={`${activeTab === 'activity' ? 'font-medium border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'} pb-2 whitespace-nowrap`}>Activity</Link>
              <Link href={tabHref('intelligence')} className={`${activeTab === 'intelligence' ? 'font-medium border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'} pb-2 whitespace-nowrap`}>Intelligence</Link>
              <Link href={tabHref('deals')} className={`${activeTab === 'deals' ? 'font-medium border-b-2 border-foreground' : 'text-muted-foreground hover:text-foreground'} pb-2 whitespace-nowrap`}>Deals</Link>
            </div>

      {/* Next-best-action: AI suggestions + drafts surface at the top of Overview
          so the realtor can approve/send without navigating to Intelligence. */}
      {activeTab === 'overview' && (
        <>
          <AgentContactPanel contactId={contact.id} slug={slug} contactName={contact.name} />
          <FollowUpSuggestions
            contactId={contact.id}
            scoreLabel={contact.scoreLabel}
            contactType={contact.type}
            hasTours={contact.tours.length > 0}
            hasDeals={contact.dealContacts.length > 0}
            hasFollowUp={!!contact.followUpAt}
          />
        </>
      )}

      {/* ── AI Lead Score Card ── */}
      {activeTab === 'intelligence' && contact.scoringStatus === 'scored' && (
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-primary/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <h2 className="text-base font-semibold text-foreground">AI Lead Score</h2>
            </div>
            <RescoreButton contactId={contact.id} />
          </div>
          <div className="px-4 sm:px-6 py-5 space-y-5">
            {/* Score + tier + status badges */}
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <span
                  className="text-3xl tracking-tight text-foreground tabular-nums"
                  style={{ fontFamily: 'var(--font-title)' }}
                >
                  {contact.leadScore != null ? Math.round(contact.leadScore) : '—'}
                </span>
                <span className={`inline-flex text-xs font-semibold rounded-full px-3 py-1.5 uppercase ${tierBadgeClasses(contact.scoreLabel ?? 'cold')}`}>
                  {contact.scoreLabel}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {details?.confidence != null && (
                  <span className="text-xs text-muted-foreground">
                    {Math.round(details.confidence * 100)}% confidence
                  </span>
                )}
                {details?.qualificationStatus && (
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-2.5 py-0.5">
                    {details.qualificationStatus}
                  </span>
                )}
                {details?.readinessStatus && (
                  <span className="text-xs text-muted-foreground border border-border rounded-full px-2.5 py-0.5">
                    {details.readinessStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Summary */}
            {contact.scoreSummary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{contact.scoreSummary}</p>
            )}

            {/* Explanation tags */}
            {details?.explanationTags && details.explanationTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {details.explanationTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 bg-primary/8 text-primary">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Recommended next action — promoted to top */}
            {details?.recommendedNextAction && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 px-4 py-3 flex items-start gap-2">
                <ArrowRight size={14} className="text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-primary mb-0.5">Recommended next action</p>
                  <p className="text-sm text-foreground">{details.recommendedNextAction}</p>
                </div>
              </div>
            )}

            {/* ── Strengths + Weaknesses ── */}
            {(details?.strengths?.length || details?.weaknesses?.length) && (
              <div className="border-t border-border pt-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Assessment</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {details?.strengths && details.strengths.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 size={13} /> Strengths
                      </p>
                      <ul className="space-y-1.5">
                        {details.strengths.map((s) => (
                          <li key={s} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                            <span className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0">+</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {details?.weaknesses && details.weaknesses.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                        <XCircle size={13} /> Weaknesses
                      </p>
                      <ul className="space-y-1.5">
                        {details.weaknesses.map((w) => (
                          <li key={w} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                            <span className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0">-</span>
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Risk flags ── */}
            {details?.riskFlags && details.riskFlags.length > 0 && details.riskFlags[0] !== 'none' && (
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Risk flags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {details.riskFlags.map((flag) => (
                    <span key={flag} className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 bg-destructive/10 text-destructive">
                      {flag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Missing info ── */}
            {details?.missingInformation && details.missingInformation.length > 0 && (
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Info size={13} /> Missing information
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {details.missingInformation.map((item) => (
                    <span key={item} className="inline-flex text-xs rounded-full px-2.5 py-1 bg-muted text-muted-foreground">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Scoring in progress ── */}
      {activeTab === 'intelligence' && contact.scoringStatus === 'pending' && (
        <div className="rounded-lg border border-border bg-card px-4 sm:px-6 py-5 flex items-center gap-3">
          <Sparkles size={16} className="text-primary animate-pulse" />
          <div>
            <p className="text-sm font-medium">Scoring in progress…</p>
            <p className="text-xs text-muted-foreground">Chip is analysing this contact. Refresh in a moment.</p>
          </div>
        </div>
      )}

      {/* ── Unscored / failed — show score prompt ── */}
      {activeTab === 'intelligence' && (contact.scoringStatus === 'failed' || contact.scoringStatus === 'unscored' || (contact.scoringStatus !== 'scored' && contact.scoringStatus !== 'pending')) && (
        <div className="rounded-lg border border-border bg-card px-4 sm:px-6 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles size={16} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">AI Lead Score</p>
              <p className="text-xs text-muted-foreground">
                {contact.scoringStatus === 'failed' ? 'Previous score attempt failed.' : 'This contact has not been scored yet.'}
              </p>
            </div>
          </div>
          <RescoreButton contactId={contact.id} />
        </div>
      )}

      {/* ── Agent Intelligence Panel ── */}
      {activeTab === 'intelligence' && (
        <AgentContactPanel contactId={contact.id} slug={slug} contactName={contact.name} />
      )}

      {/* ── Application Details (rich structured data) ── */}
      {activeTab === 'overview' && (app ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-emerald-500/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Application details</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {app.submittedAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar size={12} />
                  {new Date(app.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {app.completedSteps && (
                <span className="text-xs font-medium bg-primary/8 text-primary rounded-full px-2.5 py-0.5">
                  {app.completedSteps.length}/10 steps
                </span>
              )}
              <PdfExportButton contactId={contact.id} />
            </div>
          </div>
          {/* Application status manager with messaging */}
          <div className="px-4 sm:px-6 py-3 border-b border-border/50">
            <ApplicationStatusManager
              contactId={contact.id}
              currentStatus={contact.applicationStatus ?? 'received'}
              statusNote={contact.applicationStatusNote ?? null}
            />
          </div>
          {/* Dynamic form display (uses formConfigSnapshot when present) */}
          {formSnapshot ? (
            <div className="px-4 sm:px-6 py-2">
              <DynamicApplicationDisplay
                applicationData={app as Record<string, any>}
                formConfigSnapshot={formSnapshot}
                defaultOpen
              />
            </div>
          ) : (
          <div className="px-4 sm:px-6 py-2 divide-y divide-border/50">
            {/* Property — always open (most important) */}
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

            {/* Income — always open (key qualification info) */}
            {(app.employmentStatus || app.employerOrSource || app.monthlyGrossIncome != null || app.additionalIncome != null) && (
              <CollapsibleSection title="Income" defaultOpen>
                <DetailGrid>
                  {app.employmentStatus && <Detail label="Employment" value={app.employmentStatus} />}
                  {app.employerOrSource && <Detail label="Employer" value={app.employerOrSource} />}
                  {app.monthlyGrossIncome != null && <Detail label="Monthly gross" value={typeof app.monthlyGrossIncome === 'number' ? formatCurrency(app.monthlyGrossIncome) : String(app.monthlyGrossIncome)} />}
                  {app.additionalIncome != null && <Detail label="Additional" value={formatCurrency(app.additionalIncome)} />}
                </DetailGrid>
              </CollapsibleSection>
            )}

            {/* Screening — always open (critical flags) */}
            {(app.priorEvictions != null || app.outstandingBalances != null || app.bankruptcy != null || app.smoking != null || app.hasPets != null) && (
              <CollapsibleSection title="Screening" defaultOpen>
                <DetailGrid>
                  {app.priorEvictions != null && <Detail label="Evictions" value={app.priorEvictions ? 'Yes' : 'No'} flag={app.priorEvictions} />}
                  {app.outstandingBalances != null && <Detail label="Outstanding balances" value={app.outstandingBalances ? 'Yes' : 'No'} flag={app.outstandingBalances} />}
                  {app.bankruptcy != null && <Detail label="Bankruptcy" value={app.bankruptcy ? 'Yes' : 'No'} flag={app.bankruptcy} />}
                  {app.backgroundAcknowledgment != null && <Detail label="Background check" value={app.backgroundAcknowledgment ? 'Acknowledged' : 'Not acknowledged'} />}
                  {app.smoking != null && <Detail label="Smoking" value={app.smoking ? 'Yes' : 'No'} />}
                  {app.hasPets != null && <Detail label="Pets" value={app.hasPets ? (app.petDetails ?? 'Yes') : 'No'} />}
                </DetailGrid>
              </CollapsibleSection>
            )}

            {/* Applicant basics — collapsed */}
            {app.dateOfBirth && (
              <CollapsibleSection title="Applicant">
                <DetailGrid>
                  <Detail label="Date of birth" value={app.dateOfBirth} />
                </DetailGrid>
              </CollapsibleSection>
            )}

            {/* Current Living — collapsed */}
            {(app.currentAddress || app.currentHousingStatus || app.currentMonthlyPayment != null || app.lengthOfResidence || app.reasonForMoving) && (
              <CollapsibleSection title="Current living situation">
                <DetailGrid>
                  {app.currentAddress && <Detail label="Address" value={app.currentAddress} />}
                  {app.currentHousingStatus && <Detail label="Status" value={app.currentHousingStatus} />}
                  {app.currentMonthlyPayment != null && <Detail label="Monthly payment" value={formatCurrency(app.currentMonthlyPayment)} />}
                  {app.lengthOfResidence && <Detail label="Length" value={app.lengthOfResidence} />}
                  {app.reasonForMoving && <Detail label="Reason for moving" value={app.reasonForMoving} span={2} />}
                </DetailGrid>
              </CollapsibleSection>
            )}

            {/* Household — collapsed */}
            {(app.adultsOnApplication != null || app.childrenOrDependents != null || app.coRenters || app.emergencyContactName) && (
              <CollapsibleSection title="Household">
                <DetailGrid>
                  {app.adultsOnApplication != null && <Detail label="Adults" value={String(app.adultsOnApplication)} />}
                  {app.childrenOrDependents != null && <Detail label="Children/dependents" value={String(app.childrenOrDependents)} />}
                  {app.coRenters && <Detail label="Co-renters" value={app.coRenters} span={2} />}
                  {app.emergencyContactName && <Detail label="Emergency contact" value={`${app.emergencyContactName}${app.emergencyContactPhone ? ` — ${app.emergencyContactPhone}` : ''}`} span={2} />}
                </DetailGrid>
              </CollapsibleSection>
            )}

            {/* Rental History — collapsed */}
            {(app.currentLandlordName || app.previousLandlordName || app.currentRentPaid != null || app.latePayments != null || app.leaseViolations != null) && (
              <CollapsibleSection title="Rental history">
                <DetailGrid>
                  {app.currentLandlordName && <Detail label="Current landlord" value={`${app.currentLandlordName}${app.currentLandlordPhone ? ` — ${app.currentLandlordPhone}` : ''}`} span={2} />}
                  {app.previousLandlordName && <Detail label="Previous landlord" value={`${app.previousLandlordName}${app.previousLandlordPhone ? ` — ${app.previousLandlordPhone}` : ''}`} span={2} />}
                  {app.currentRentPaid != null && <Detail label="Rent paid" value={formatCurrency(app.currentRentPaid)} />}
                  {app.latePayments != null && <Detail label="Late payments" value={app.latePayments ? 'Yes' : 'No'} flag={app.latePayments} />}
                  {app.leaseViolations != null && <Detail label="Lease violations" value={app.leaseViolations ? 'Yes' : 'No'} flag={app.leaseViolations} />}
                  {app.permissionToContactReferences != null && <Detail label="Contact refs" value={app.permissionToContactReferences ? 'Allowed' : 'Not allowed'} />}
                </DetailGrid>
              </CollapsibleSection>
            )}

            {/* Consents — collapsed */}
            {(app.consentToScreening != null || app.truthfulnessCertification != null || app.electronicSignature) && (
              <CollapsibleSection title="Consents & signature">
                <DetailGrid>
                  {app.consentToScreening != null && <Detail label="Screening consent" value={app.consentToScreening ? 'Given' : 'Not given'} />}
                  {app.truthfulnessCertification != null && <Detail label="Certified accurate" value={app.truthfulnessCertification ? 'Yes' : 'No'} />}
                  {app.electronicSignature && <Detail label="E-signature" value={app.electronicSignature} />}
                  {app.submittedAt && <Detail label="Submitted" value={new Date(app.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} />}
                </DetailGrid>
              </CollapsibleSection>
            )}
          </div>
          )}
        </div>
      ) : (
        /* Legacy application details (no structured data) */
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-emerald-500/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">Application details</h2>
          </div>
          <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contact.budget != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Budget</p>
                <p className="text-sm font-semibold text-foreground">
                  {typeof contact.budget === 'number'
                    ? <>{formatCurrency(contact.budget)}<span className="text-muted-foreground font-normal">/mo</span></>
                    : String(contact.budget)}
                </p>
              </div>
            )}
            {contact.address && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current address</p>
                <p className="text-sm text-foreground">{contact.address}</p>
              </div>
            )}
            {contact.preferences && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Preferred areas</p>
                <p className="text-sm text-foreground">{contact.preferences}</p>
              </div>
            )}
            {(contact.properties ?? []).length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-2">Interested in</p>
                <div className="flex flex-wrap gap-1.5">
                  {(contact.properties ?? []).map((property) => (
                    <Badge key={property} variant="secondary" className="text-xs font-medium">
                      {property}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* ── Consent Record ── */}
      {activeTab === 'overview' && contact.consentGiven != null && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-2">
            <ShieldCheck size={14} className="text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Privacy Consent</h2>
          </div>
          <div className="px-4 sm:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Consent Given</p>
              <p className="text-sm font-medium text-foreground">
                {contact.consentGiven ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 size={14} /> Yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <XCircle size={14} /> No
                  </span>
                )}
              </p>
            </div>
            {contact.consentTimestamp && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                <p className="text-sm text-foreground">
                  {new Date(contact.consentTimestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            )}
            {contact.consentIp && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">IP Address</p>
                <p className="text-sm text-foreground font-mono">
                  {contact.consentIp !== 'unknown'
                    ? contact.consentIp.replace(/\d+\.\d+\.\d+\.(\d+)/, '*.*.*.$1')
                    : 'unknown'}
                </p>
              </div>
            )}
            {contact.consentPrivacyPolicyUrl && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Privacy Policy URL (at time of consent)</p>
                <a
                  href={safeHref(contact.consentPrivacyPolicyUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline break-all"
                >
                  {contact.consentPrivacyPolicyUrl}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tags */}
      {activeTab === 'overview' && (contact.tags ?? []).filter((t) => t !== 'application-link' && t !== 'new-lead').length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 sm:px-6 py-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {(contact.tags ?? [])
              .filter((t) => t !== 'application-link' && t !== 'new-lead')
              .map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
          </div>
        </div>
      )}

      {/* Activity log */}
      {activeTab === 'activity' && (
        <ContactActivityTab contactId={contact.id} contactCreatedAt={String(contact.createdAt)} />
      )}

      {/* Tour history */}
      {activeTab === 'activity' && contact.tours.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-amber-500/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-2">
            <CalendarDays size={14} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-base font-semibold text-foreground">Tour History</h2>
            <span className="ml-auto text-xs text-muted-foreground">{contact.tours.length} tours</span>
          </div>
          <div className="px-4 sm:px-6 py-3 space-y-2">
            {contact.tours.map((tour: any) => {
              const statusColors: Record<string, string> = {
                scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
                confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
                completed: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                no_show: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
              };
              return (
                <Link
                  key={tour.id}
                  href={`/s/${slug}/calendar`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <CalendarDays size={14} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {new Date(tour.startsAt).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' at '}
                        {new Date(tour.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      {tour.propertyAddress && (
                        <p className="text-xs text-muted-foreground truncate">{tour.propertyAddress}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full self-start sm:self-auto flex-shrink-0 ${statusColors[tour.status] || 'bg-muted'}`}>
                    {tour.status}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Linked deals */}
      {activeTab === 'deals' && (
      <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-indigo-500/40">
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-2">
          <Briefcase size={14} className="text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-base font-semibold text-foreground">Linked Deals</h2>
          {contact.dealContacts.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{contact.dealContacts.length} {contact.dealContacts.length === 1 ? 'deal' : 'deals'}</span>
          )}
        </div>
        <div className="px-4 sm:px-6 py-3">
          {contact.dealContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <Briefcase size={24} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No deals linked yet — create a deal and link this contact.</p>
              <Link
                href={`/s/${slug}/deals`}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
              >
                Go to Deals <ExternalLink size={11} />
              </Link>
            </div>
          ) : (
            <div className="space-y-2 py-1">
              {contact.dealContacts.map(({ deal }) => {
                const priorityMeta: Record<string, { label: string; className: string }> = {
                  LOW: { label: 'Low', className: 'bg-muted text-muted-foreground' },
                  MEDIUM: { label: 'Medium', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
                  HIGH: { label: 'High', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
                };
                const statusMeta: Record<string, { label: string; className: string }> = {
                  active: { label: 'Active', className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
                  won: { label: 'Won', className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
                  lost: { label: 'Lost', className: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
                  on_hold: { label: 'On Hold', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
                };
                const priority = priorityMeta[deal.priority] ?? priorityMeta.MEDIUM;
                const status = statusMeta[deal.status] ?? statusMeta.active;
                return (
                  <Link
                    key={deal.id}
                    href={`/s/${slug}/deals/${deal.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className={`text-sm font-medium leading-snug truncate ${deal.status === 'lost' ? 'line-through text-muted-foreground' : ''}`}>{deal.title}</p>
                      {deal.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{deal.address}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      {deal.value != null && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-md px-1.5 py-0.5">
                          {formatCurrency(deal.value)}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: deal.stage.color }}
                      >
                        {deal.stage.name}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${priority.className}`}>
                        {priority.label}
                      </span>
                      <ExternalLink size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

          </main>
        </div>
      </div>
    </div>
  );
}

// ── Helper components ──

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
