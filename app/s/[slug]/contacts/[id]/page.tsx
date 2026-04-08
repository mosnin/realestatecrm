import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  FileText,
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
import { ComposeEmailDialog } from '@/components/contacts/compose-email-dialog';
import { ContactFollowUpField } from '@/components/contacts/contact-follow-up-field';
import { FollowUpSuggestions } from '@/components/contacts/follow-up-suggestions';
import { StageProgression } from '@/components/contacts/stage-progression';
import { RescoreButton } from '@/components/contacts/rescore-button';
import { ApplicationStatusControl } from '@/components/contacts/application-status-control';
import { PdfExportButton } from '@/components/contacts/pdf-export-button';
import { CollapsibleSection } from '@/components/contacts/collapsible-section';
import { DynamicApplicationDisplay } from '@/components/contacts/dynamic-application-display';
import { getInitials, formatCurrency } from '@/lib/formatting';
import { getSpaceFromSlug } from '@/lib/space';


function tierBadgeClasses(label: string) {
  if (label === 'hot') return 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400';
  if (label === 'warm') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400';
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  let contact: (Contact & { dealContacts: { deal: { id: string; title: string; address: string | null; value: number | null; stage: { name: string; color: string } } }[]; tours: { id: string; startsAt: string; endsAt: string; status: string; propertyAddress: string | null }[] }) | null = null;
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
      const { data: dealRows, error: dealError } = await supabase.from('DealContact').select('Deal(id, title, address, value, DealStage(name, color))').eq('contactId', id);
      if (dealError) throw dealError;
      const { data: tourRows } = await supabase.from('Tour').select('id, guestName, startsAt, endsAt, status, propertyAddress').eq('contactId', id).order('startsAt', { ascending: false }).limit(10);
      contact = {
        ...c,
        dealContacts: ((dealRows ?? []) as { Deal: { id: string; title: string; address: string | null; value: number | null; DealStage: { name: string; color: string } } }[]).map((row) => ({
          deal: {
            id: row.Deal.id,
            title: row.Deal.title,
            address: row.Deal.address,
            value: row.Deal.value,
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

  return (
    <div className="max-w-4xl space-y-5">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
          <Link href={`/s/${slug}/contacts`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/s/${slug}/contacts`} className="hover:text-foreground transition-colors">
            Clients
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{contact.name}</span>
        </div>
      </div>

      {/* Profile header card */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Identity section */}
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-primary/10 flex items-center justify-center text-lg sm:text-xl font-bold text-primary flex-shrink-0">
              {getInitials(contact.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{contact.name}</h1>
                {contact.sourceLabel && (
                  <span className="inline-flex items-center text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
                    {contact.sourceLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <StageProgression contactId={contact.id} currentType={contact.type} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Added {new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>

        {/* Contact info + follow-up row */}
        <div className="px-4 sm:px-6 py-3 border-t border-border bg-muted/30">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-card border border-border hover:bg-muted/80 transition-colors text-foreground"
              >
                <Phone size={14} className="text-muted-foreground" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-card border border-border hover:bg-muted/80 transition-colors text-foreground truncate max-w-[280px]"
              >
                <Mail size={14} className="text-muted-foreground flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </a>
            )}
            {contact.email && (
              <ComposeEmailDialog
                contactId={contact.id}
                contactName={contact.name}
                contactEmail={contact.email}
              />
            )}
            <div className="w-px h-5 bg-border hidden sm:block" />
            <ContactFollowUpField
              contactId={contact.id}
              followUpAt={contact.followUpAt ? String(contact.followUpAt) : null}
              lastContactedAt={contact.lastContactedAt ? String(contact.lastContactedAt) : null}
            />
          </div>
        </div>

        {/* Quick actions */}
        <div className="px-4 sm:px-6 py-3 border-t border-border flex flex-wrap gap-2">
          <Link
            href={`/s/${slug}/tours?schedule=${contact.id}`}
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <CalendarPlus size={13} />
            Schedule Tour
          </Link>
          <Link
            href={`/s/${slug}/deals`}
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <Briefcase size={13} />
            Create Deal
          </Link>
        </div>
      </div>

      {/* Smart follow-up suggestions */}
      <FollowUpSuggestions
        contactId={contact.id}
        scoreLabel={contact.scoreLabel}
        contactType={contact.type}
        hasTours={contact.tours.length > 0}
        hasDeals={contact.dealContacts.length > 0}
        hasFollowUp={!!contact.followUpAt}
      />

      {/* ── AI Lead Score Card ── */}
      {contact.scoringStatus === 'scored' && contact.leadScore != null && (
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-primary/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-primary" />
              <h2 className="text-sm font-semibold">AI Lead Score</h2>
            </div>
            <RescoreButton contactId={contact.id} />
          </div>
          <div className="px-4 sm:px-6 py-5 space-y-5">
            {/* Score + tier + status badges */}
            <div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-4xl font-bold tabular-nums">{Math.round(contact.leadScore)}</span>
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
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Assessment</p>
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

      {/* ── Unscored / failed — show score prompt ── */}
      {(contact.scoringStatus === 'failed' || contact.scoringStatus === 'unscored' || (contact.scoringStatus !== 'scored' && contact.scoringStatus !== 'pending')) && (
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

      {/* ── Application Details (rich structured data) ── */}
      {app ? (
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-emerald-500/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Application details</h2>
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
          {/* Application status control */}
          <div className="px-4 sm:px-6 py-3 border-b border-border/50">
            <ApplicationStatusControl
              contactId={contact.id}
              currentStatus={contact.applicationStatus ?? 'received'}
              statusNote={contact.applicationStatusNote ?? null}
            />
          </div>
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
        </div>
      ) : (
        /* Legacy application details (no structured data) */
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-emerald-500/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Application details</h2>
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
            {contact.properties.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground mb-2">Properties of interest</p>
                <div className="flex flex-wrap gap-1.5">
                  {contact.properties.map((property) => (
                    <Badge key={property} variant="secondary" className="text-xs font-medium">
                      {property}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Consent Record ── */}
      {contact.consentGiven != null && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-2">
            <ShieldCheck size={14} className="text-muted-foreground" />
            <h2 className="text-sm font-semibold">Privacy Consent</h2>
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
                  href={contact.consentPrivacyPolicyUrl}
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

      {/* Notes */}
      {contact.notes && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" /> Notes
            </h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {contact.notes}
            </p>
          </div>
        </div>
      )}

      {/* Additional notes from application */}
      {app?.additionalNotes && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" /> Applicant notes
            </h2>
          </div>
          <div className="px-4 sm:px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {app.additionalNotes}
            </p>
          </div>
        </div>
      )}

      {/* Tags */}
      {contact.tags.filter((t) => t !== 'application-link' && t !== 'new-lead').length > 0 && (
        <div className="rounded-lg border border-border bg-card px-4 sm:px-6 py-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags
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
      <ContactActivityTab contactId={contact.id} contactCreatedAt={String(contact.createdAt)} />

      {/* Tour history */}
      {contact.tours.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-amber-500/40">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-2">
            <CalendarDays size={14} className="text-amber-600 dark:text-amber-400" />
            <h2 className="text-sm font-semibold">Tour History</h2>
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
                  href={`/s/${slug}/tours`}
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

      {/* Associated deals */}
      <div className="rounded-lg border border-border bg-card overflow-hidden border-l-4 border-l-indigo-500/40">
        <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center gap-2">
          <Briefcase size={14} className="text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-semibold">Associated deals</h2>
          {contact.dealContacts.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">{contact.dealContacts.length} deals</span>
          )}
        </div>
        <div className="px-4 sm:px-6 py-3">
          {contact.dealContacts.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">No deals linked.</p>
              <Link
                href={`/s/${slug}/deals`}
                className="text-xs text-primary font-medium hover:underline mt-1 inline-block"
              >
                Go to deals →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {contact.dealContacts.map(({ deal }) => (
                <Link
                  key={deal.id}
                  href={`/s/${slug}/deals`}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{deal.title}</p>
                    {deal.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {deal.address}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {deal.value != null && (
                      <p className="text-sm font-semibold tabular-nums">
                        ${deal.value.toLocaleString()}
                      </p>
                    )}
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: deal.stage.color }}
                    >
                      {deal.stage.name}
                    </span>
                    <ExternalLink size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
                  </div>
                </Link>
              ))}
            </div>
          )}
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
