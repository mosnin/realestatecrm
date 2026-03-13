import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  FileText,
  Wallet,
  ExternalLink,
  Briefcase,
  Users,
  Home,
  PawPrint,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Sparkles,
  Info,
  User,
  Calendar,
} from 'lucide-react';
import type { Contact, ApplicationData, LeadScoreDetails } from '@/lib/types';

const TYPE_META: Record<string, { label: string; className: string }> = {
  QUALIFICATION: {
    label: 'Qualifying',
    className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30',
  },
  TOUR: {
    label: 'Tour scheduled',
    className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30',
  },
  APPLICATION: {
    label: 'Applied',
    className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30',
  },
};

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function tierBadgeClasses(label: string) {
  if (label === 'hot') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400';
  if (label === 'warm') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400';
  return 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400';
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;

  let contact: (Contact & { dealContacts: { deal: { id: string; title: string; address: string | null; value: number | null; stage: { name: string; color: string } } }[] }) | null = null;
  try {
    const { data: contactData, error: contactError } = await supabase.from('Contact').select('*').eq('id', id).single();
    if (contactError && contactError.code === 'PGRST116') {
      contact = null;
    } else if (contactError) {
      throw contactError;
    } else {
      const c = contactData as Contact;
      const { data: dealRows, error: dealError } = await supabase.from('DealContact').select('Deal(id, title, address, value, DealStage(name, color))').eq('contactId', id);
      if (dealError) throw dealError;
      contact = {
        ...c,
        dealContacts: ((dealRows ?? []) as { Deal: { id: string; title: string; address: string | null; value: number | null; DealStage: { name: string; color: string } } }[]).map((row) => ({
          deal: {
            id: row.Deal.id,
            title: row.Deal.title,
            address: row.Deal.address,
            value: row.Deal.value,
            stage: {
              name: row.Deal.DealStage.name,
              color: row.Deal.DealStage.color,
            },
          },
        })),
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

  const meta = TYPE_META[contact.type];
  const app = contact.applicationData as ApplicationData | null;
  const details = contact.scoreDetails as LeadScoreDetails | null;

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
      <div className="rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary flex-shrink-0">
            {getInitials(contact.name)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">{contact.name}</h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span
                className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-1 border ${meta.className}`}
              >
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Added {new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Quick contact row */}
        {(contact.email || contact.phone) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-3">
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-foreground"
              >
                <Phone size={14} className="text-muted-foreground" />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-foreground"
              >
                <Mail size={14} className="text-muted-foreground" />
                {contact.email}
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── AI Lead Score Card ── */}
      {contact.scoringStatus === 'scored' && contact.leadScore != null && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <h2 className="text-sm font-semibold">AI Lead Score</h2>
          </div>
          <div className="px-6 py-5">
            {/* Score + tier + confidence */}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-4xl font-bold tabular-nums">{Math.round(contact.leadScore)}</span>
              <span className={`inline-flex text-xs font-semibold rounded-full px-3 py-1.5 uppercase ${tierBadgeClasses(contact.scoreLabel ?? 'cold')}`}>
                {contact.scoreLabel}
              </span>
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

            {/* Summary */}
            {contact.scoreSummary && (
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{contact.scoreSummary}</p>
            )}

            {/* Explanation tags */}
            {details?.explanationTags && details.explanationTags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {details.explanationTags.map((tag) => (
                  <span key={tag} className="inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 bg-primary/8 text-primary">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Strengths + Weaknesses grid */}
            {(details?.strengths?.length || details?.weaknesses?.length) && (
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {details?.strengths && details.strengths.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Strengths
                    </p>
                    <ul className="space-y-1">
                      {details.strengths.map((s) => (
                        <li key={s} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                          <span className="text-emerald-500 mt-0.5 flex-shrink-0">+</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {details?.weaknesses && details.weaknesses.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                      <XCircle size={12} /> Weaknesses
                    </p>
                    <ul className="space-y-1">
                      {details.weaknesses.map((w) => (
                        <li key={w} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-1.5">
                          <span className="text-amber-500 mt-0.5 flex-shrink-0">-</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Risk flags */}
            {details?.riskFlags && details.riskFlags.length > 0 && details.riskFlags[0] !== 'none' && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-destructive flex items-center gap-1">
                  <AlertTriangle size={12} /> Risk flags
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

            {/* Missing info */}
            {details?.missingInformation && details.missingInformation.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Info size={12} /> Missing information
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

            {/* Recommended next action */}
            {details?.recommendedNextAction && (
              <div className="mt-4 rounded-xl bg-primary/5 border border-primary/10 px-4 py-3 flex items-start gap-2">
                <ArrowRight size={14} className="text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-primary mb-0.5">Recommended next action</p>
                  <p className="text-sm text-foreground">{details.recommendedNextAction}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Application Details (rich structured data) ── */}
      {app ? (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Application details</h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              {app.submittedAt && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar size={11} />
                  {new Date(app.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
              {app.completedSteps && (
                <span className="text-xs font-medium bg-primary/8 text-primary rounded-full px-2.5 py-0.5">
                  {app.completedSteps.length}/9 steps
                </span>
              )}
            </div>
          </div>
          <div className="px-6 py-4 space-y-6">
            {/* Applicant basics — fields not shown in the profile header */}
            {app.dateOfBirth && (
              <Section icon={User} title="Applicant">
                <DetailGrid>
                  <Detail label="Date of birth" value={app.dateOfBirth} />
                </DetailGrid>
              </Section>
            )}

            {/* Property */}
            {(app.propertyAddress || app.unitType || app.targetMoveInDate || app.monthlyRent != null || app.leaseTermPreference || app.numberOfOccupants != null) && (
              <Section icon={Home} title="Property">
                <DetailGrid>
                  {app.propertyAddress && <Detail label="Address" value={app.propertyAddress} />}
                  {app.unitType && <Detail label="Unit type" value={app.unitType} />}
                  {app.targetMoveInDate && <Detail label="Move-in date" value={app.targetMoveInDate} />}
                  {app.monthlyRent != null && <Detail label="Monthly rent" value={formatCurrency(app.monthlyRent)} />}
                  {app.leaseTermPreference && <Detail label="Lease term" value={app.leaseTermPreference} />}
                  {app.numberOfOccupants != null && <Detail label="Occupants" value={String(app.numberOfOccupants)} />}
                </DetailGrid>
              </Section>
            )}

            {/* Current Living */}
            {(app.currentAddress || app.currentHousingStatus || app.currentMonthlyPayment != null || app.lengthOfResidence || app.reasonForMoving) && (
              <Section icon={MapPin} title="Current living situation">
                <DetailGrid>
                  {app.currentAddress && <Detail label="Address" value={app.currentAddress} />}
                  {app.currentHousingStatus && <Detail label="Status" value={app.currentHousingStatus} />}
                  {app.currentMonthlyPayment != null && <Detail label="Monthly payment" value={formatCurrency(app.currentMonthlyPayment)} />}
                  {app.lengthOfResidence && <Detail label="Length" value={app.lengthOfResidence} />}
                  {app.reasonForMoving && <Detail label="Reason for moving" value={app.reasonForMoving} span={2} />}
                </DetailGrid>
              </Section>
            )}

            {/* Household */}
            {(app.adultsOnApplication != null || app.childrenOrDependents != null || app.coRenters || app.emergencyContactName) && (
              <Section icon={Users} title="Household">
                <DetailGrid>
                  {app.adultsOnApplication != null && <Detail label="Adults" value={String(app.adultsOnApplication)} />}
                  {app.childrenOrDependents != null && <Detail label="Children/dependents" value={String(app.childrenOrDependents)} />}
                  {app.coRenters && <Detail label="Co-renters" value={app.coRenters} span={2} />}
                  {app.emergencyContactName && <Detail label="Emergency contact" value={`${app.emergencyContactName}${app.emergencyContactPhone ? ` — ${app.emergencyContactPhone}` : ''}`} span={2} />}
                </DetailGrid>
              </Section>
            )}

            {/* Income */}
            {(app.employmentStatus || app.employerOrSource || app.monthlyGrossIncome != null || app.additionalIncome != null) && (
              <Section icon={Briefcase} title="Income">
                <DetailGrid>
                  {app.employmentStatus && <Detail label="Employment" value={app.employmentStatus} />}
                  {app.employerOrSource && <Detail label="Employer" value={app.employerOrSource} />}
                  {app.monthlyGrossIncome != null && <Detail label="Monthly gross" value={formatCurrency(app.monthlyGrossIncome)} />}
                  {app.additionalIncome != null && <Detail label="Additional" value={formatCurrency(app.additionalIncome)} />}
                </DetailGrid>
              </Section>
            )}

            {/* Rental History */}
            {(app.currentLandlordName || app.previousLandlordName || app.currentRentPaid != null || app.latePayments != null || app.leaseViolations != null) && (
              <Section icon={FileText} title="Rental history">
                <DetailGrid>
                  {app.currentLandlordName && <Detail label="Current landlord" value={`${app.currentLandlordName}${app.currentLandlordPhone ? ` — ${app.currentLandlordPhone}` : ''}`} span={2} />}
                  {app.previousLandlordName && <Detail label="Previous landlord" value={`${app.previousLandlordName}${app.previousLandlordPhone ? ` — ${app.previousLandlordPhone}` : ''}`} span={2} />}
                  {app.currentRentPaid != null && <Detail label="Rent paid" value={formatCurrency(app.currentRentPaid)} />}
                  {app.latePayments != null && <Detail label="Late payments" value={app.latePayments ? 'Yes' : 'No'} flag={app.latePayments} />}
                  {app.leaseViolations != null && <Detail label="Lease violations" value={app.leaseViolations ? 'Yes' : 'No'} flag={app.leaseViolations} />}
                  {app.permissionToContactReferences != null && <Detail label="Contact refs" value={app.permissionToContactReferences ? 'Allowed' : 'Not allowed'} />}
                </DetailGrid>
              </Section>
            )}

            {/* Screening */}
            {(app.priorEvictions != null || app.outstandingBalances != null || app.bankruptcy != null || app.smoking != null || app.hasPets != null) && (
              <Section icon={AlertTriangle} title="Screening">
                <DetailGrid>
                  {app.priorEvictions != null && <Detail label="Evictions" value={app.priorEvictions ? 'Yes' : 'No'} flag={app.priorEvictions} />}
                  {app.outstandingBalances != null && <Detail label="Outstanding balances" value={app.outstandingBalances ? 'Yes' : 'No'} flag={app.outstandingBalances} />}
                  {app.bankruptcy != null && <Detail label="Bankruptcy" value={app.bankruptcy ? 'Yes' : 'No'} flag={app.bankruptcy} />}
                  {app.backgroundAcknowledgment != null && <Detail label="Background check" value={app.backgroundAcknowledgment ? 'Acknowledged' : 'Not acknowledged'} />}
                  {app.smoking != null && <Detail label="Smoking" value={app.smoking ? 'Yes' : 'No'} />}
                  {app.hasPets != null && <Detail label="Pets" value={app.hasPets ? (app.petDetails ?? 'Yes') : 'No'} />}
                </DetailGrid>
              </Section>
            )}

            {/* Consents */}
            {(app.consentToScreening != null || app.truthfulnessCertification != null || app.electronicSignature) && (
              <Section icon={PawPrint} title="Consents & signature">
                <DetailGrid>
                  {app.consentToScreening != null && <Detail label="Screening consent" value={app.consentToScreening ? 'Given' : 'Not given'} />}
                  {app.truthfulnessCertification != null && <Detail label="Certified accurate" value={app.truthfulnessCertification ? 'Yes' : 'No'} />}
                  {app.electronicSignature && <Detail label="E-signature" value={app.electronicSignature} />}
                  {app.submittedAt && <Detail label="Submitted" value={new Date(app.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} />}
                </DetailGrid>
              </Section>
            )}
          </div>
        </div>
      ) : (
        /* Legacy application details (no structured data) */
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold">Application details</h2>
          </div>
          <div className="px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {contact.budget != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Monthly budget</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatCurrency(contact.budget)}<span className="text-muted-foreground font-normal">/mo</span>
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

      {/* Notes */}
      {contact.notes && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" /> Notes
            </h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {contact.notes}
            </p>
          </div>
        </div>
      )}

      {/* Additional notes from application */}
      {app?.additionalNotes && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" /> Applicant notes
            </h2>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {app.additionalNotes}
            </p>
          </div>
        </div>
      )}

      {/* Tags */}
      {contact.tags.filter((t) => t !== 'application-link' && t !== 'new-lead').length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-4">
          <p className="text-xs text-muted-foreground mb-2">Tags</p>
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

      {/* Associated deals */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">Associated deals</h2>
        </div>
        <div className="px-6 py-4">
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
                  className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{deal.title}</p>
                    {deal.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {deal.address}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                    {deal.value != null && (
                      <p className="text-sm font-semibold tabular-nums">
                        ${deal.value.toLocaleString()}
                      </p>
                    )}
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
                      style={{ backgroundColor: deal.stage.color }}
                    >
                      {deal.stage.name}
                    </span>
                    <ExternalLink size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ size: number; className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/50 pt-4 first:border-t-0 first:pt-0">
      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-3">
        <Icon size={13} className="text-muted-foreground" />
        {title}
      </p>
      {children}
    </div>
  );
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">{children}</div>;
}

function Detail({ label, value, span, flag }: { label: string; value: string; span?: number; flag?: boolean }) {
  return (
    <div className={span === 2 ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-medium ${flag ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
