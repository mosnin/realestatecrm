import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
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
  Home,
  Users,
  Briefcase,
  History,
  ShieldCheck,
  FolderOpen,
  PenLine,
  User,
  CalendarDays,
  Building2,
} from 'lucide-react';

// ─── Notes parser ──────────────────────────────────────────────────────────────

type ParsedApplication = {
  // Property
  propertyAddress?: string;
  unitType?: string;
  moveInDate?: string;
  monthlyRent?: string;
  leaseTerm?: string;
  occupants?: string;
  // Applicant
  dateOfBirth?: string;
  ssnLast4?: string;
  // Living situation
  currentAddress?: string;
  housingStatus?: string;
  monthlyPayment?: string;
  lengthOfResidence?: string;
  reasonForMoving?: string;
  // Household
  adults?: string;
  children?: string;
  roommates?: string;
  emergencyContact?: string;
  // Co-applicants
  coApplicants: string[];
  // Income
  employment?: string;
  employer?: string;
  monthlyIncome?: string;
  additionalIncome?: string;
  // Rental history
  currentLandlord?: string;
  previousLandlord?: string;
  rentPaid?: string;
  latePayments?: string;
  latePaymentDetails?: string;
  referencePermission?: string;
  // Screening
  priorEvictions?: string;
  outstandingBalance?: string;
  bankruptcy?: string;
  smoking?: string;
  pets?: string;
  petDetails?: string;
  // Documents
  uploadedDocs: Array<{ category: string; name: string; url: string }>;
  documentNotes?: string;
  // Signature
  signature?: string;
};

function parseApplicationNotes(notes: string): ParsedApplication | null {
  if (!notes.includes('=== Multi-Step Rental Application ===')) return null;

  const result: ParsedApplication = { coApplicants: [], uploadedDocs: [] };

  function extract(label: string): string | undefined {
    const re = new RegExp(`^${label}:\\s*(.+)$`, 'm');
    const m = notes.match(re);
    return m ? m[1].trim() : undefined;
  }

  result.propertyAddress    = extract('Property');
  result.unitType           = extract('Unit type');
  result.moveInDate         = extract('Move-in date');
  result.monthlyRent        = extract('Monthly rent');
  result.leaseTerm          = extract('Lease term');
  result.occupants          = extract('Occupants');
  result.dateOfBirth        = extract('DOB');
  result.ssnLast4           = extract('SSN last 4');
  result.currentAddress     = extract('Current address');
  result.housingStatus      = extract('Housing status');
  result.monthlyPayment     = extract('Monthly payment');
  result.lengthOfResidence  = extract('Length of residence');
  result.reasonForMoving    = extract('Reason for moving');
  result.adults             = extract('Adults');
  result.children           = extract('Children');
  result.roommates          = extract('Roommates');
  result.emergencyContact   = extract('Emergency contact');
  result.employment         = extract('Employment');
  result.employer           = extract('Employer');
  result.monthlyIncome      = extract('Monthly income');
  result.additionalIncome   = extract('Additional income');
  result.currentLandlord    = extract('Current landlord');
  result.previousLandlord   = extract('Previous landlord');
  result.rentPaid           = extract('Rent paid');
  result.latePayments       = extract('Late payments');
  result.latePaymentDetails = extract('Late payment details');
  result.referencePermission= extract('Reference permission');
  result.priorEvictions     = extract('Prior evictions');
  result.outstandingBalance = extract('Outstanding balance');
  result.bankruptcy         = extract('Bankruptcy');
  result.smoking            = extract('Smoking');
  result.pets               = extract('Pets');
  result.petDetails         = extract('Pet details');
  result.signature          = extract('Signed');

  // Co-applicants
  const coApplicantRe = /^Co-applicant \d+: (.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = coApplicantRe.exec(notes)) !== null) {
    result.coApplicants.push(m[1].trim());
  }

  // Uploaded documents
  const docRe = /^\[([^\]]+)\] (.+?) — (https?:\/\/\S+)$/gm;
  while ((m = docRe.exec(notes)) !== null) {
    result.uploadedDocs.push({ category: m[1], name: m[2].trim(), url: m[3].trim() });
  }

  // Document notes section
  const docNotesMatch = notes.match(/--- Document Notes ---\n([\s\S]+?)(?=\n---|$)/);
  if (docNotesMatch) result.documentNotes = docNotesMatch[1].trim();

  return result;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-3.5 border-b border-border flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">{children}</div>;
}

// ─── Page ──────────────────────────────────────────────────────────────────────

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

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ subdomain: string; id: string }>;
}) {
  const { subdomain, id } = await params;

  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      dealContacts: {
        include: { deal: { include: { stage: true } } },
      },
    },
  });

  if (!contact) notFound();

  const meta = TYPE_META[contact.type];
  const isFullApp = contact.tags.includes('multi-step-application');
  const parsed = contact.notes ? parseApplicationNotes(contact.notes) : null;

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="max-w-3xl space-y-4">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground">
          <Link href={`/s/${subdomain}/contacts`}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/s/${subdomain}/contacts`} className="hover:text-foreground transition-colors">
            Clients
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">{contact.name}</span>
        </div>
      </div>

      {/* Profile header */}
      <div className="rounded-2xl border border-border bg-card px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-xl font-bold text-primary flex-shrink-0">
            {getInitials(contact.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold tracking-tight">{contact.name}</h1>
              {isFullApp && (
                <span className="text-[10px] font-semibold text-primary/80 bg-primary/10 rounded-full px-2 py-0.5">
                  Full application
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-1 border ${meta.className}`}>
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">
                Submitted {new Date(contact.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* Quick contact row */}
        {(contact.email || contact.phone) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
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

      {/* ── MULTI-STEP APPLICATION VIEW ── */}
      {parsed ? (
        <>
          {/* Property */}
          {(parsed.propertyAddress || parsed.unitType || parsed.moveInDate || parsed.monthlyRent || parsed.leaseTerm || parsed.occupants) && (
            <SectionCard icon={<Home size={14} />} title="Property">
              <FieldGrid>
                <Field label="Property / address" value={parsed.propertyAddress} />
                <Field label="Unit type" value={parsed.unitType} />
                <Field label="Move-in date" value={parsed.moveInDate} />
                <Field label="Monthly rent" value={parsed.monthlyRent} />
                <Field label="Lease term" value={parsed.leaseTerm} />
                <Field label="Total occupants" value={parsed.occupants} />
              </FieldGrid>
            </SectionCard>
          )}

          {/* Primary applicant */}
          {(parsed.dateOfBirth || parsed.ssnLast4 || contact.budget != null || contact.address) && (
            <SectionCard icon={<User size={14} />} title="Primary Applicant">
              <FieldGrid>
                <Field label="Date of birth" value={parsed.dateOfBirth} />
                <Field label="SSN (last 4)" value={parsed.ssnLast4} />
                {contact.budget != null && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Monthly budget</p>
                    <p className="text-sm text-foreground">{formatCurrency(contact.budget)}<span className="text-muted-foreground">/mo</span></p>
                  </div>
                )}
              </FieldGrid>
            </SectionCard>
          )}

          {/* Living situation */}
          {(parsed.currentAddress || parsed.housingStatus || parsed.monthlyPayment || parsed.lengthOfResidence || parsed.reasonForMoving) && (
            <SectionCard icon={<MapPin size={14} />} title="Living Situation">
              <FieldGrid>
                <div className="sm:col-span-2">
                  <Field label="Current address" value={parsed.currentAddress} />
                </div>
                <Field label="Housing status" value={parsed.housingStatus} />
                <Field label="Monthly payment" value={parsed.monthlyPayment} />
                <Field label="Length of residence" value={parsed.lengthOfResidence} />
                <Field label="Reason for moving" value={parsed.reasonForMoving} />
              </FieldGrid>
            </SectionCard>
          )}

          {/* Household */}
          {(parsed.adults || parsed.children || parsed.roommates || parsed.emergencyContact) && (
            <SectionCard icon={<Users size={14} />} title="Household">
              <FieldGrid>
                <Field label="Adults on application" value={parsed.adults} />
                <Field label="Children" value={parsed.children} />
                <Field label="Roommates" value={parsed.roommates} />
                {parsed.emergencyContact && (
                  <div className="sm:col-span-2">
                    <Field label="Emergency contact" value={parsed.emergencyContact} />
                  </div>
                )}
              </FieldGrid>
            </SectionCard>
          )}

          {/* Co-applicants */}
          {parsed.coApplicants.length > 0 && (
            <SectionCard icon={<Users size={14} />} title={`Co-Applicants (${parsed.coApplicants.length})`}>
              <div className="space-y-3">
                {parsed.coApplicants.map((ca, i) => {
                  const parts = ca.split(' | ');
                  const [name, email, phone, dob, employment, income] = parts;
                  return (
                    <div key={i} className="rounded-xl border border-border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Name</p>
                        <p className="text-sm font-medium">{name}</p>
                      </div>
                      {email && <div><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Email</p><p className="text-sm">{email}</p></div>}
                      {phone && <div><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Phone</p><p className="text-sm">{phone}</p></div>}
                      {dob && <div><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Date of birth</p><p className="text-sm">{dob.replace('DOB: ', '')}</p></div>}
                      {employment && <div><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Employment</p><p className="text-sm">{employment.replace('Employment: ', '')}</p></div>}
                      {income && <div><p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Monthly income</p><p className="text-sm">{income.replace('Income: ', '')}</p></div>}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Income */}
          {(parsed.employment || parsed.employer || parsed.monthlyIncome || parsed.additionalIncome) && (
            <SectionCard icon={<Briefcase size={14} />} title="Income & Employment">
              <FieldGrid>
                <Field label="Employment status" value={parsed.employment} />
                <Field label="Employer" value={parsed.employer} />
                <Field label="Monthly income" value={parsed.monthlyIncome} />
                <Field label="Additional income" value={parsed.additionalIncome} />
              </FieldGrid>
            </SectionCard>
          )}

          {/* Rental history */}
          {(parsed.currentLandlord || parsed.previousLandlord || parsed.rentPaid || parsed.latePayments || parsed.referencePermission) && (
            <SectionCard icon={<History size={14} />} title="Rental History">
              <FieldGrid>
                <Field label="Current landlord" value={parsed.currentLandlord} />
                <Field label="Previous landlord" value={parsed.previousLandlord} />
                <Field label="Monthly rent paid" value={parsed.rentPaid} />
                <Field label="Late payments" value={parsed.latePayments} />
                {parsed.latePaymentDetails && (
                  <div className="sm:col-span-2">
                    <Field label="Late payment details" value={parsed.latePaymentDetails} />
                  </div>
                )}
                <Field label="Reference permission" value={parsed.referencePermission} />
              </FieldGrid>
            </SectionCard>
          )}

          {/* Screening */}
          {(parsed.priorEvictions || parsed.outstandingBalance || parsed.bankruptcy || parsed.smoking || parsed.pets) && (
            <SectionCard icon={<ShieldCheck size={14} />} title="Background Screening">
              <FieldGrid>
                <Field label="Prior evictions" value={parsed.priorEvictions} />
                <Field label="Outstanding balance" value={parsed.outstandingBalance} />
                <Field label="Bankruptcy" value={parsed.bankruptcy} />
                <Field label="Smoking" value={parsed.smoking} />
                <Field label="Pets" value={parsed.pets} />
                {parsed.petDetails && (
                  <div className="sm:col-span-2">
                    <Field label="Pet details" value={parsed.petDetails} />
                  </div>
                )}
              </FieldGrid>
            </SectionCard>
          )}

          {/* Uploaded documents */}
          {parsed.uploadedDocs.length > 0 && (
            <SectionCard icon={<FolderOpen size={14} />} title={`Documents (${parsed.uploadedDocs.length})`}>
              <div className="space-y-2">
                {parsed.uploadedDocs.map((doc, i) => (
                  <a
                    key={i}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{doc.category}</p>
                    </div>
                    <ExternalLink size={13} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-3" />
                  </a>
                ))}
              </div>
              {parsed.documentNotes && (
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{parsed.documentNotes}</p>
              )}
            </SectionCard>
          )}

          {/* Signature */}
          {parsed.signature && (
            <SectionCard icon={<PenLine size={14} />} title="Electronic Signature">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30">
                <ShieldCheck size={16} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Signed as</p>
                  <p className="text-sm font-semibold text-green-700 dark:text-green-400">{parsed.signature}</p>
                </div>
              </div>
            </SectionCard>
          )}
        </>
      ) : (
        /* ── LEGACY / SIMPLE CONTACT VIEW ── */
        <>
          {(contact.budget != null || contact.address || contact.preferences || contact.properties.length > 0) && (
            <SectionCard icon={<Building2 size={14} />} title="Application Details">
              <FieldGrid>
                {contact.budget != null && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Monthly budget</p>
                    <p className="text-sm font-semibold">{formatCurrency(contact.budget)}<span className="text-muted-foreground font-normal">/mo</span></p>
                  </div>
                )}
                <Field label="Current address" value={contact.address} />
                {contact.preferences && (
                  <div className="sm:col-span-2">
                    <Field label="Preferred areas" value={contact.preferences} />
                  </div>
                )}
                {contact.properties.length > 0 && (
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Properties of interest</p>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.properties.map((property) => (
                        <Badge key={property} variant="secondary" className="text-xs font-medium">{property}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </FieldGrid>
            </SectionCard>
          )}

          {contact.notes && (
            <SectionCard icon={<FileText size={14} />} title="Notes">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
            </SectionCard>
          )}
        </>
      )}

      {/* Tags */}
      {contact.tags.filter((t) => !['application-link', 'new-lead', 'multi-step-application'].includes(t)).length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-6 py-4">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags
              .filter((t) => !['application-link', 'new-lead', 'multi-step-application'].includes(t))
              .map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
              ))}
          </div>
        </div>
      )}

      {/* Associated deals */}
      <SectionCard icon={<Briefcase size={14} />} title="Associated Deals">
        {contact.dealContacts.length === 0 ? (
          <div className="text-center py-3">
            <p className="text-sm text-muted-foreground">No deals linked.</p>
            <Link
              href={`/s/${subdomain}/deals`}
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
                href={`/s/${subdomain}/deals`}
                className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{deal.title}</p>
                  {deal.address && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{deal.address}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  {deal.value != null && (
                    <p className="text-sm font-semibold tabular-nums">${deal.value.toLocaleString()}</p>
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
      </SectionCard>
    </div>
  );
}
