'use client';

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { DateWheelPicker } from '@/components/ui/date-wheel-picker';
import {
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Home,
  User,
  MapPin,
  Users,
  DollarSign,
  History,
  ShieldCheck,
  FileText,
  PenLine,
  Upload,
} from 'lucide-react';

// ── Step config ──
const ALL_STEPS = [
  { id: 1, label: 'Property', icon: Home },
  { id: 2, label: 'About You', icon: User },
  { id: 3, label: 'Housing', icon: MapPin },
  { id: 4, label: 'Household', icon: Users },
  { id: 5, label: 'Income', icon: DollarSign },
  { id: 6, label: 'History', icon: History },
  { id: 7, label: 'Screening', icon: ShieldCheck },
  { id: 8, label: 'Details', icon: FileText },
  { id: 9, label: 'Documents', icon: Upload },
  { id: 10, label: 'Submit', icon: PenLine },
] as const;

type FormData = Record<string, string>;

const STORAGE_KEY_PREFIX = 'chippi_apply_';

function getStorageKey(slug: string) {
  return `${STORAGE_KEY_PREFIX}${slug}`;
}

function loadDraft(slug: string): FormData {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getStorageKey(slug));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(slug: string, data: FormData) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(slug), JSON.stringify(data));
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearDraft(slug: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(slug));
  } catch {}
}

function safeParseDate(raw: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? undefined : d;
}

// ── Select component (inline, lightweight) ──
function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
      >
        <option value="">{placeholder ?? 'Select...'}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Toggle pill for yes/no ──
function ToggleField({
  id,
  label,
  value,
  onChange,
  description,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={() => onChange(value === 'true' ? '' : 'true')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === 'true'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(value === 'false' ? '' : 'false')}
          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
            value === 'false'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background border-border text-muted-foreground hover:bg-muted'
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}

// ── Field wrapper ──
function Field({
  id,
  label,
  required,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={error ? 'border-destructive' : ''}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Progress bar ──
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Step {current} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Step labels (compact on mobile) ──
function StepIndicator({ current, steps }: { current: number; steps: readonly { id: number; label: string; icon: any }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      {steps.map((step) => {
        const Icon = step.icon;
        const isActive = step.id === current;
        const isDone = step.id < current;
        return (
          <div
            key={step.id}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              isActive
                ? 'bg-primary text-primary-foreground'
                : isDone
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground'
            }`}
          >
            <Icon size={12} />
            <span className="hidden sm:inline">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function ApplicationForm({
  slug,
  businessName,
}: {
  slug: string;
  businessName: string;
}) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(() => loadDraft(slug));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [scoreState, setScoreState] = useState<{
    scoringStatus?: string;
    leadScore?: number | null;
    scoreLabel?: string;
    scoreSummary?: string | null;
    scoreDetails?: Record<string, unknown> | null;
    applicationRef?: string;
  } | null>(null);
  const submissionLockRef = useRef(false);

  const get = useCallback((key: string) => data[key] ?? '', [data]);

  // Conditional logic: determine which steps to show based on answers
  const STEPS = ALL_STEPS.filter((s) => {
    // Skip rental history (step 6) if they own their home
    if (s.id === 6 && data.currentHousingStatus === 'own') return false;
    return true;
  });

  // Map display index to actual step id
  const currentStepIndex = STEPS.findIndex((s) => s.id === step);
  const totalSteps = STEPS.length;

  const set = useCallback(
    (key: string, value: string) => {
      setData((prev) => {
        const next = { ...prev, [key]: value };
        saveDraft(slug, next);
        return next;
      });
      setErrors((prev) => {
        if (prev[key]) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return prev;
      });
    },
    [slug]
  );

  // ── Validation per step ──
  function validateStep(s: number): boolean {
    const errs: Record<string, string> = {};

    if (s === 2) {
      if (!get('legalName').trim()) errs.legalName = 'Full name is required';
      if (!get('phone').trim()) errs.phone = 'Phone number is required';
      const email = get('email').trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email';
    }

    if (s === 10) {
      if (!get('truthfulnessCertification') || get('truthfulnessCertification') !== 'true')
        errs.truthfulnessCertification = 'Please certify the information is accurate';
      if (!get('electronicSignature')?.trim())
        errs.electronicSignature = 'Please type your full name as signature';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    // Jump to next visible step
    const nextSteps = STEPS.filter((s) => s.id > step);
    if (nextSteps.length > 0) setStep(nextSteps[0].id);
  }

  function goBack() {
    // Jump to previous visible step
    const prevSteps = STEPS.filter((s) => s.id < step);
    if (prevSteps.length > 0) setStep(prevSteps[prevSteps.length - 1].id);
  }

  async function onSubmit() {
    if (!validateStep(step)) return;
    if (submitting || submissionLockRef.current) return;

    submissionLockRef.current = true;
    setSubmitting(true);
    setSubmitError('');

    const payload: Record<string, unknown> = {
      slug,
      // Step 1
      propertyAddress: get('propertyAddress'),
      unitType: get('unitType'),
      targetMoveInDate: get('targetMoveInDate'),
      monthlyRent: get('monthlyRent'),
      leaseTermPreference: get('leaseTermPreference'),
      numberOfOccupants: get('numberOfOccupants'),
      // Step 2
      legalName: get('legalName'),
      email: get('email'),
      phone: get('phone'),
      dateOfBirth: get('dateOfBirth'),
      // Step 3
      currentAddress: get('currentAddress'),
      currentHousingStatus: get('currentHousingStatus'),
      currentMonthlyPayment: get('currentMonthlyPayment'),
      lengthOfResidence: get('lengthOfResidence'),
      reasonForMoving: get('reasonForMoving'),
      // Step 4
      adultsOnApplication: get('adultsOnApplication'),
      childrenOrDependents: get('childrenOrDependents'),
      coRenters: get('coRenters'),
      emergencyContactName: get('emergencyContactName'),
      emergencyContactPhone: get('emergencyContactPhone'),
      // Step 5
      employmentStatus: get('employmentStatus'),
      employerOrSource: get('employerOrSource'),
      monthlyGrossIncome: get('monthlyGrossIncome'),
      additionalIncome: get('additionalIncome'),
      // Step 6
      currentLandlordName: get('currentLandlordName'),
      currentLandlordPhone: get('currentLandlordPhone'),
      previousLandlordName: get('previousLandlordName'),
      previousLandlordPhone: get('previousLandlordPhone'),
      currentRentPaid: get('currentRentPaid'),
      latePayments: get('latePayments'),
      leaseViolations: get('leaseViolations'),
      permissionToContactReferences: get('permissionToContactReferences'),
      // Step 7
      priorEvictions: get('priorEvictions'),
      outstandingBalances: get('outstandingBalances'),
      bankruptcy: get('bankruptcy'),
      backgroundAcknowledgment: get('backgroundAcknowledgment'),
      smoking: get('smoking'),
      hasPets: get('hasPets'),
      petDetails: get('petDetails'),
      // Step 8
      additionalNotes: get('additionalNotes'),
      // Step 9
      consentToScreening: get('consentToScreening'),
      truthfulnessCertification: get('truthfulnessCertification'),
      electronicSignature: get('electronicSignature'),
      completedSteps: ALL_STEPS.map((s) => s.id),
    };

    try {
      const response = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        setScoreState(result);
        setSubmitted(true);
        clearDraft(slug);
      } else {
        const body = await response.json().catch(() => ({}));
        setSubmitError(body?.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setSubmitError('Unable to submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
      submissionLockRef.current = false;
    }
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 text-center space-y-5">
        <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} className="text-green-600" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold text-foreground">Application received</h2>
          <p className="text-sm text-muted-foreground">
            {businessName} will review your application and follow up shortly.
          </p>
        </div>
        {scoreState?.applicationRef && (
          <a
            href={`/apply/${slug}/status?ref=${scoreState.applicationRef}`}
            className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
          >
            Track your application status →
          </a>
        )}
        {scoreState?.scoringStatus === 'scored' && scoreState.scoreSummary && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-left space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Initial assessment
              </p>
              {scoreState.leadScore != null && (
                <span
                  className={`inline-flex text-xs font-semibold rounded-full px-2.5 py-0.5 uppercase ${
                    scoreState.scoreLabel === 'hot'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                      : scoreState.scoreLabel === 'warm'
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400'
                  }`}
                >
                  {scoreState.scoreLabel}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground leading-relaxed">{scoreState.scoreSummary}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Step content renderer ──
  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Property details"
              description="Which property are you interested in?"
            />
            <Field id="propertyAddress" label="Property address or listing" value={get('propertyAddress')} onChange={(v) => set('propertyAddress', v)} placeholder="123 Main St, Apt 4B" />
            <Field id="unitType" label="Unit or bedroom type" value={get('unitType')} onChange={(v) => set('unitType', v)} placeholder="e.g. 2BR / 1BA" />
            <div className="space-y-1.5">
              <Label>Target move-in date</Label>
              <div className="rounded-lg border border-input bg-background p-3">
                <DateWheelPicker
                  value={safeParseDate(get('targetMoveInDate'))}
                  onChange={(date) =>
                    set(
                      'targetMoveInDate',
                      date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                    )
                  }
                  minYear={new Date().getFullYear()}
                  maxYear={new Date().getFullYear() + 2}
                  size="sm"
                />
              </div>
              {get('targetMoveInDate') && (
                <p className="text-xs text-muted-foreground">
                  Selected: {get('targetMoveInDate')}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="monthlyRent" label="Monthly rent" value={get('monthlyRent')} onChange={(v) => set('monthlyRent', v)} placeholder="e.g. 2500" type="text" />
              <SelectField id="leaseTermPreference" label="Lease term" value={get('leaseTermPreference')} onChange={(v) => set('leaseTermPreference', v)} options={[{ value: '12 months', label: '12 months' }, { value: '6 months', label: '6 months' }, { value: 'Month-to-month', label: 'Month-to-month' }, { value: 'Other', label: 'Other' }]} />
            </div>
            <Field id="numberOfOccupants" label="Number of occupants" value={get('numberOfOccupants')} onChange={(v) => set('numberOfOccupants', v)} placeholder="e.g. 2" type="text" />
          </div>
        );

      case 2:
        return (
          <div className="space-y-5">
            <StepHeader
              title="About you"
              description="Basic contact and identification info."
            />
            <Field id="legalName" label="Legal full name" required value={get('legalName')} onChange={(v) => set('legalName', v)} placeholder="Alex Johnson" error={errors.legalName} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="email" label="Email" value={get('email')} onChange={(v) => set('email', v)} placeholder="alex@email.com" type="email" error={errors.email} />
              <Field id="phone" label="Mobile phone" required value={get('phone')} onChange={(v) => set('phone', v)} placeholder="(555) 123-4567" type="tel" error={errors.phone} />
            </div>
            <Field id="dateOfBirth" label="Date of birth" value={get('dateOfBirth')} onChange={(v) => set('dateOfBirth', v)} placeholder="MM/DD/YYYY" />
          </div>
        );

      case 3:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Current living situation"
              description="Where are you living now?"
            />
            <Field id="currentAddress" label="Current address" value={get('currentAddress')} onChange={(v) => set('currentAddress', v)} placeholder="456 Oak Ave, Unit 2" />
            <SelectField id="currentHousingStatus" label="Do you own, rent, or live rent-free?" value={get('currentHousingStatus')} onChange={(v) => set('currentHousingStatus', v)} options={[{ value: 'rent', label: 'Rent' }, { value: 'own', label: 'Own' }, { value: 'rent-free', label: 'Live rent-free' }]} />
            {get('currentHousingStatus') === 'rent' && (
              <Field id="currentMonthlyPayment" label="Current monthly payment" value={get('currentMonthlyPayment')} onChange={(v) => set('currentMonthlyPayment', v)} placeholder="e.g. 1800" />
            )}
            <Field id="lengthOfResidence" label="How long have you lived there?" value={get('lengthOfResidence')} onChange={(v) => set('lengthOfResidence', v)} placeholder="e.g. 2 years" />
            <Field id="reasonForMoving" label="Reason for moving" value={get('reasonForMoving')} onChange={(v) => set('reasonForMoving', v)} placeholder="e.g. Relocating for work" />
          </div>
        );

      case 4:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Household"
              description="Who will be living in the unit?"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="adultsOnApplication" label="Adults on application" value={get('adultsOnApplication')} onChange={(v) => set('adultsOnApplication', v)} placeholder="e.g. 2" type="text" />
              <Field id="childrenOrDependents" label="Children or dependents" value={get('childrenOrDependents')} onChange={(v) => set('childrenOrDependents', v)} placeholder="e.g. 1" type="text" />
            </div>
            <Field id="coRenters" label="Roommates or co-renters" value={get('coRenters')} onChange={(v) => set('coRenters', v)} placeholder="Names of any co-applicants" />
            <div className="border-t border-border/50 pt-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Emergency contact</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="emergencyContactName" label="Name" value={get('emergencyContactName')} onChange={(v) => set('emergencyContactName', v)} placeholder="Jane Johnson" />
                <Field id="emergencyContactPhone" label="Phone" value={get('emergencyContactPhone')} onChange={(v) => set('emergencyContactPhone', v)} placeholder="(555) 987-6543" type="tel" />
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Income"
              description="Help us verify you can comfortably afford the rent."
            />
            <SelectField id="employmentStatus" label="Employment status" value={get('employmentStatus')} onChange={(v) => set('employmentStatus', v)} options={[{ value: 'employed', label: 'Employed' }, { value: 'self-employed', label: 'Self-employed' }, { value: 'unemployed', label: 'Unemployed' }, { value: 'retired', label: 'Retired' }, { value: 'student', label: 'Student' }]} />
            {(get('employmentStatus') === 'employed' || get('employmentStatus') === 'self-employed') && (
              <Field id="employerOrSource" label="Employer or income source" value={get('employerOrSource')} onChange={(v) => set('employerOrSource', v)} placeholder="e.g. Acme Corp" />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="monthlyGrossIncome" label="Monthly gross income" value={get('monthlyGrossIncome')} onChange={(v) => set('monthlyGrossIncome', v)} placeholder="e.g. 6000" />
              <Field id="additionalIncome" label="Additional income" value={get('additionalIncome')} onChange={(v) => set('additionalIncome', v)} placeholder="e.g. 500" />
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Rental history"
              description="References from current or previous landlords."
            />
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current landlord</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="currentLandlordName" label="Name" value={get('currentLandlordName')} onChange={(v) => set('currentLandlordName', v)} placeholder="Landlord name" />
                <Field id="currentLandlordPhone" label="Phone" value={get('currentLandlordPhone')} onChange={(v) => set('currentLandlordPhone', v)} placeholder="(555) 000-0000" type="tel" />
              </div>
            </div>
            <div className="border-t border-border/50 pt-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Previous landlord</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field id="previousLandlordName" label="Name" value={get('previousLandlordName')} onChange={(v) => set('previousLandlordName', v)} placeholder="Previous landlord name" />
                <Field id="previousLandlordPhone" label="Phone" value={get('previousLandlordPhone')} onChange={(v) => set('previousLandlordPhone', v)} placeholder="(555) 000-0000" type="tel" />
              </div>
            </div>
            <Field id="currentRentPaid" label="Current rent paid" value={get('currentRentPaid')} onChange={(v) => set('currentRentPaid', v)} placeholder="e.g. 1800" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ToggleField id="latePayments" label="Any late payments?" value={get('latePayments')} onChange={(v) => set('latePayments', v)} />
              <ToggleField id="leaseViolations" label="Any lease violations?" value={get('leaseViolations')} onChange={(v) => set('leaseViolations', v)} />
            </div>
            <ToggleField id="permissionToContactReferences" label="May we contact your references?" value={get('permissionToContactReferences')} onChange={(v) => set('permissionToContactReferences', v)} />
          </div>
        );

      case 7:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Screening questions"
              description="Quick questions to help us process your application."
            />
            <div className="space-y-4">
              <ToggleField id="priorEvictions" label="Any prior evictions?" value={get('priorEvictions')} onChange={(v) => set('priorEvictions', v)} />
              <ToggleField id="outstandingBalances" label="Outstanding balances owed to a landlord?" value={get('outstandingBalances')} onChange={(v) => set('outstandingBalances', v)} />
              <ToggleField id="bankruptcy" label="Filed for bankruptcy in the last 7 years?" value={get('bankruptcy')} onChange={(v) => set('bankruptcy', v)} />
              <ToggleField id="backgroundAcknowledgment" label="Acknowledge background check may be conducted?" value={get('backgroundAcknowledgment')} onChange={(v) => set('backgroundAcknowledgment', v)} description="Where legally permitted" />
            </div>
            <div className="border-t border-border/50 pt-4 space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Lifestyle</p>
              <ToggleField id="smoking" label="Do you smoke?" value={get('smoking')} onChange={(v) => set('smoking', v)} />
              <ToggleField id="hasPets" label="Do you have pets?" value={get('hasPets')} onChange={(v) => set('hasPets', v)} />
              {get('hasPets') === 'true' && (
                <Field id="petDetails" label="Pet details" value={get('petDetails')} onChange={(v) => set('petDetails', v)} placeholder="e.g. 1 dog, 30 lbs, Labrador" />
              )}
            </div>
          </div>
        );

      case 8:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Additional details"
              description="Anything else we should know about your application?"
            />
            <div className="space-y-1.5">
              <Label htmlFor="additionalNotes">Notes or special requests</Label>
              <Textarea
                id="additionalNotes"
                value={get('additionalNotes')}
                onChange={(e) => set('additionalNotes', e.target.value)}
                placeholder="Parking needs, accessibility requirements, move-in flexibility, etc."
                rows={5}
              />
            </div>
          </div>
        );

      case 9:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Supporting documents"
              description="Optionally upload ID, pay stubs, proof of income, or pet records."
            />
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Uploading documents is optional but helps speed up the review process. You can always provide these later.
              </p>
            </div>
            {scoreState?.applicationRef || get('_contactId') ? (
              <DocumentUploadWidget contactId={scoreState?.applicationRef || get('_contactId')} />
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">Documents can be uploaded after submission.</p>
                <p className="text-xs mt-1">Click Continue to proceed to review.</p>
              </div>
            )}
          </div>
        );

      case 10:
        return (
          <div className="space-y-5">
            <StepHeader
              title="Review and submit"
              description="Please confirm and sign your application."
            />
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium text-foreground">Application summary</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {get('legalName') && <SummaryRow label="Name" value={get('legalName')} />}
                {get('phone') && <SummaryRow label="Phone" value={get('phone')} />}
                {get('email') && <SummaryRow label="Email" value={get('email')} />}
                {get('propertyAddress') && <SummaryRow label="Property" value={get('propertyAddress')} />}
                {get('targetMoveInDate') && <SummaryRow label="Move-in" value={get('targetMoveInDate')} />}
                {get('monthlyRent') && <SummaryRow label="Rent" value={`$${get('monthlyRent')}`} />}
                {get('employmentStatus') && <SummaryRow label="Employment" value={get('employmentStatus')} />}
                {get('monthlyGrossIncome') && <SummaryRow label="Income" value={`$${get('monthlyGrossIncome')}/mo`} />}
                {get('hasPets') && <SummaryRow label="Pets" value={get('hasPets') === 'true' ? `Yes${get('petDetails') ? ` — ${get('petDetails')}` : ''}` : 'No'} />}
              </div>
            </div>

            <ToggleField id="consentToScreening" label="I consent to background and credit screening" value={get('consentToScreening')} onChange={(v) => set('consentToScreening', v)} />

            <div className="space-y-1.5">
              <ToggleField
                id="truthfulnessCertification"
                label="I certify that the information provided is accurate and complete"
                value={get('truthfulnessCertification')}
                onChange={(v) => set('truthfulnessCertification', v)}
              />
              {errors.truthfulnessCertification && (
                <p className="text-xs text-destructive">{errors.truthfulnessCertification}</p>
              )}
            </div>

            <Field
              id="electronicSignature"
              label="Electronic signature (type your full name)"
              required
              value={get('electronicSignature')}
              onChange={(v) => set('electronicSignature', v)}
              placeholder="Alex Johnson"
              error={errors.electronicSignature}
            />

            <p className="text-xs text-muted-foreground leading-relaxed">
              By submitting, you agree to share this information with {businessName} for the purpose of evaluating your rental application.
              {/* TODO: Add links to privacy policy and terms when those routes exist */}
            </p>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Progress */}
      <div className="px-5 pt-5 pb-3 space-y-3 border-b border-border/50">
        <ProgressBar current={currentStepIndex + 1} total={totalSteps} />
        <StepIndicator current={step} steps={STEPS} />
      </div>

      {/* Step content */}
      <div className="px-5 py-6 md:px-7 md:py-7">{renderStep()}</div>

      {/* Navigation */}
      <div className="px-5 pb-5 md:px-7 md:pb-7">
        {submitError && (
          <p className="text-sm text-destructive mb-3">{submitError}</p>
        )}
        <div className="flex gap-3">
          {currentStepIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-shrink-0"
            >
              <ChevronLeft size={16} className="mr-1" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {currentStepIndex < totalSteps - 1 ? (
            <Button type="button" onClick={goNext} className="flex-shrink-0">
              Continue
              <ChevronRight size={16} className="ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              size="lg"
              className="flex-1 sm:flex-none"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit application'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Document upload widget (inline, simplified for public form) ──
function DocumentUploadWidget({ contactId }: { contactId: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-muted-foreground">
      <Upload size={24} className="mx-auto mb-2 opacity-50" />
      <p className="text-sm">Document upload available after submission</p>
      <p className="text-xs mt-1">You&apos;ll be able to upload files from the status page.</p>
    </div>
  );
}

// ── Tiny helpers ──
function StepHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium truncate">{value}</span>
    </>
  );
}
