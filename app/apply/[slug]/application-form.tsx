'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Home,
  User,
  MapPin,
  DollarSign,
  FileText,
  Clock,
  TrendingUp,
  Briefcase,
  Key,
  ListChecks,
} from 'lucide-react';

// ── Step config ──
const RENTAL_STEPS = [
  { id: 1, label: 'Start', icon: Home },
  { id: 2, label: 'Basics', icon: User },
  { id: 3, label: 'Timing', icon: Clock },
  { id: 4, label: 'Location', icon: MapPin },
  { id: 5, label: 'Budget', icon: DollarSign },
  { id: 6, label: 'Income', icon: TrendingUp },
  { id: 7, label: 'Work', icon: Briefcase },
  { id: 8, label: 'Home', icon: Home },
  { id: 9, label: 'Details', icon: FileText },
  { id: 10, label: 'Ready?', icon: CheckCircle2 },
] as const;

const BUYER_STEPS = [
  { id: 1, label: 'Start', icon: Home },
  { id: 2, label: 'Basics', icon: User },
  { id: 3, label: 'Budget', icon: DollarSign },
  { id: 4, label: 'Pre-Approval', icon: CheckCircle2 },
  { id: 5, label: 'Property', icon: Home },
  { id: 6, label: 'Features', icon: ListChecks },
  { id: 7, label: 'Timeline', icon: Clock },
  { id: 8, label: 'About You', icon: User },
  { id: 9, label: 'Ready?', icon: CheckCircle2 },
] as const;

type FormData = Record<string, string>;

export interface IntakeCustomization {
  accentColor: string;
  borderRadius: string;
  font: string;
  darkMode: boolean;
  headerBgColor: string | null;
  headerGradient: string | null;
  videoUrl: string | null;
  disclaimerText: string | null;
  thankYouTitle: string | null;
  thankYouMessage: string | null;
  footerLinks: { label: string; url: string }[];
  disabledSteps: number[];
  customQuestions: { id: string; label: string; type: string; required?: boolean }[];
  faviconUrl: string | null;
  bio: string | null;
  socialLinks: Record<string, string> | null;
  privacyPolicyUrl: string | null;
  consentCheckboxLabel: string | null;
}

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

// ── Progress bar ──
function ProgressBar({ current, total, accentColor }: { current: number; total: number; accentColor?: string }) {
  const pct = Math.round((current / total) * 100);
  const color = accentColor || 'hsl(var(--primary))';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
        <span>Step {current} of {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        />
      </div>
    </div>
  );
}

// ── Step labels (compact on mobile) ──
function StepIndicator({ current, steps, accentColor }: { current: number; steps: readonly { id: number; label: string; icon: any }[]; accentColor?: string }) {
  const color = accentColor || 'hsl(var(--primary))';
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      {steps.map((step) => {
        const Icon = step.icon;
        const isActive = step.id === current;
        const isDone = step.id < current;
        return (
          <div
            key={step.id}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0',
              !isActive && !isDone && 'text-muted-foreground/60',
              isDone && 'text-muted-foreground',
            )}
            style={isActive ? { backgroundColor: color, color: '#fff' } : isDone ? { backgroundColor: `${color}15`, color } : undefined}
          >
            <Icon size={11} />
            <span className="hidden sm:inline">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const FONT_CLASS_MAP: Record<string, string> = {
  system: '',
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};

const RADIUS_CLASS_MAP: Record<string, string> = {
  rounded: 'rounded-xl',
  none: 'rounded-none',
  full: 'rounded-2xl',
};

/** Parse a YouTube or Loom URL into an embeddable src. */
function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // YouTube
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.hostname.includes('youtu.be')
        ? u.pathname.slice(1)
        : u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    // Loom
    if (u.hostname.includes('loom.com')) {
      const match = u.pathname.match(/\/share\/([a-zA-Z0-9]+)/);
      return match ? `https://www.loom.com/embed/${match[1]}` : null;
    }
    // Fallback: return as-is (may already be an embed URL)
    return url;
  } catch {
    return null;
  }
}

// ── Step header ──
function StepHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

// ── Selection card (radio-style pill) ──
function SelectionCard({
  label,
  selected,
  onClick,
  accentColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3.5 rounded-xl border transition-all text-sm',
        selected
          ? 'border-2 shadow-sm font-medium'
          : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
      )}
      style={selected ? { borderColor: accentColor, backgroundColor: `${accentColor}08` } : undefined}
    >
      {label}
    </button>
  );
}

export function ApplicationForm({
  slug,
  businessName,
  customization,
  brokerageId,
}: {
  slug: string;
  businessName: string;
  customization?: IntakeCustomization;
  brokerageId?: string;
}) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [data, setData] = useState<FormData>(() => loadDraft(slug));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const confettiRef = useRef<ConfettiRef>(null);
  const [scoreState, setScoreState] = useState<{
    id?: string;
    scoringStatus?: string;
    leadScore?: number | null;
    scoreLabel?: string;
    scoreSummary?: string | null;
    scoreDetails?: Record<string, unknown> | null;
    applicationRef?: string;
  } | null>(null);
  const submissionLockRef = useRef(false);

  const get = useCallback((key: string) => data[key] ?? '', [data]);

  const disabledSteps = customization?.disabledSteps ?? [];
  const leadType = get('leadType');

  const ALL_STEPS = leadType === 'buyer' ? BUYER_STEPS : RENTAL_STEPS;
  const STEPS = ALL_STEPS.filter((s) => !disabledSteps.includes(s.id));

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);
  const totalSteps = STEPS.length;

  // Debounce localStorage saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback(
    (d: FormData) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveDraft(slug, d), 500);
    },
    [slug]
  );

  const set = useCallback(
    (key: string, value: string) => {
      setData((prev) => {
        const next = { ...prev, [key]: value };
        debouncedSave(next);
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
    [debouncedSave]
  );

  // ── Validation per step ──
  function validateStep(s: number): boolean {
    const errs: Record<string, string> = {};

    if (s === 1) {
      if (!get('leadType')) errs.leadType = 'Please select rent or buy';
    }

    if (leadType === 'buyer') {
      // Buyer flow validation
      if (s === 2) {
        if (!get('name').trim()) errs.name = 'Full name is required';
        const email = get('email').trim();
        if (!email) errs.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email';
      }
      if (s === 3) {
        if (!get('buyerBudget')) errs.buyerBudget = 'Please select your budget';
      }
      // Step 4 (Pre-Approval): no required fields
      if (s === 5) {
        if (!get('propertyType')) errs.propertyType = 'Please select a property type';
      }
      // Step 6 (Features): no required fields
      if (s === 7) {
        if (!get('buyerTimeline')) errs.buyerTimeline = 'Please select your timeline';
      }
      // Step 8 (About You): no required fields
      if (s === 9) {
        if (!get('intent')) errs.intent = 'Please select your readiness level';
        if (customization?.privacyPolicyUrl && get('privacyConsent') !== 'true') {
          errs.privacyConsent = 'You must agree to the privacy policy';
        }
        if (get('chippiTosConsent') !== 'true') {
          errs.chippiTosConsent = 'You must agree to Chippi\'s Terms of Service and Privacy Policy';
        }
      }
    } else {
      // Rental flow validation
      if (s === 2) {
        if (!get('name').trim()) errs.name = 'Full name is required';
        const email = get('email').trim();
        if (!email) errs.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email';
      }
      if (s === 3) {
        if (!get('moveTiming')) errs.moveTiming = 'Please select when you plan to move';
      }
      if (s === 4) {
        if (!get('location').trim()) errs.location = 'Please enter your desired location';
      }
      if (s === 5) {
        if (!get('budget')) errs.budget = 'Please select your budget';
      }
      if (s === 6) {
        if (!get('income')) errs.income = 'Please select your income range';
      }
      if (s === 7) {
        if (!get('employment')) errs.employment = 'Please select your work situation';
      }
      if (s === 8) {
        if (!get('occupants').trim()) errs.occupants = 'Please enter the number of occupants';
      }
      // Step 9: no validation (optional details)
      if (s === 10) {
        if (!get('intent')) errs.intent = 'Please select your readiness level';
        if (customization?.privacyPolicyUrl && get('privacyConsent') !== 'true') {
          errs.privacyConsent = 'You must agree to the privacy policy';
        }
        if (get('chippiTosConsent') !== 'true') {
          errs.chippiTosConsent = 'You must agree to Chippi\'s Terms of Service and Privacy Policy';
        }
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    if (!validateStep(step)) return;
    const nextSteps = STEPS.filter((s) => s.id > step);
    if (nextSteps.length > 0) {
      setDirection(1);
      setStep(nextSteps[0].id);
    }
  }

  function goBack() {
    const prevSteps = STEPS.filter((s) => s.id < step);
    if (prevSteps.length > 0) {
      setDirection(-1);
      setStep(prevSteps[prevSteps.length - 1].id);
    }
  }

  async function onSubmit() {
    if (!validateStep(step)) return;
    if (submitting || submissionLockRef.current) return;

    submissionLockRef.current = true;
    setSubmitting(true);
    setSubmitError('');

    const payload: Record<string, unknown> = leadType === 'buyer'
      ? {
          slug,
          leadType: 'buyer',
          legalName: get('name'),
          email: get('email'),
          phone: get('phone'),
          monthlyRent: get('buyerBudget'),
          preApprovalStatus: get('preApproval'),
          preApprovalLender: get('lender'),
          preApprovalAmount: get('preApprovalAmount'),
          propertyType: get('propertyType'),
          bedrooms: get('bedrooms'),
          bathrooms: get('bathrooms'),
          mustHaves: get('mustHaves'),
          targetMoveInDate: get('buyerTimeline'),
          currentHousingStatus: get('housingSituation'),
          firstTimeBuyer: get('firstTimeBuyer'),
          leaseTermPreference: get('intent'),
          additionalNotes: get('notes'),
          privacyConsent: get('privacyConsent') === 'true',
          completedSteps: STEPS.map((s) => s.id),
        }
      : {
          slug,
          leadType: 'rental',
          legalName: get('name'),
          email: get('email'),
          phone: get('phone'),
          targetMoveInDate: get('moveTiming'),
          propertyAddress: get('location'),
          monthlyRent: get('budget'),
          monthlyGrossIncome: get('income'),
          employmentStatus: get('employment'),
          numberOfOccupants: get('occupants'),
          hasPets: get('hasPets') === 'yes',
          additionalNotes: get('notes'),
          leaseTermPreference: get('intent'),
          completedSteps: STEPS.map((s) => s.id),
          privacyConsent: get('privacyConsent') === 'true',
        };

    if (brokerageId) {
      payload.brokerageId = brokerageId;
    }

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
        setTimeout(() => {
          confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          confettiRef.current?.fire({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
          confettiRef.current?.fire({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
        }, 300);
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

  // ── Processing overlay ──
  if (submitting) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-2xl bg-card border border-border shadow-xl p-8 text-center space-y-3"
        >
          <Loader2 size={28} className="animate-spin text-primary mx-auto" />
          <p className="text-sm font-medium text-foreground">Processing your application...</p>
          <p className="text-xs text-muted-foreground">This will only take a moment</p>
        </motion.div>
      </motion.div>
    );
  }

  // ── Success screen ──
  if (submitted) {
    return (
      <>
        <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] w-full h-full" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="rounded-xl bg-card border border-border/60 shadow-sm p-6 md:p-8 text-center space-y-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
            className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto"
          >
            <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
          </motion.div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-foreground">
              {customization?.thankYouTitle || 'Application received'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {customization?.thankYouMessage || `${businessName} will review your application and follow up shortly.`}
            </p>
          </div>
          {scoreState?.applicationRef && (
            <a
              href={`/apply/${slug}/status?ref=${scoreState.applicationRef}`}
              className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
            >
              Track your application status &rarr;
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
        </motion.div>
      </>
    );
  }

  const radiusClass = RADIUS_CLASS_MAP[customization?.borderRadius || 'rounded'] || 'rounded-xl';
  const fontClass = FONT_CLASS_MAP[customization?.font || 'system'] || '';
  const accentColor = customization?.accentColor || '#ff964f';
  const embedUrl = customization?.videoUrl ? toEmbedUrl(customization.videoUrl) : null;

  // ── Step content renderer ──
  function renderStep() {
    switch (step) {
      // ── Step 1: Basic Info ──
      case 1:
        return (
          <div className="space-y-4">
            <StepHeader
              title="Let's start with the basics"
              description="We just need a few details to get going."
            />
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="Alex Johnson"
                value={get('name')}
                onChange={(e) => set('name', e.target.value)}
                className={cn('h-12 rounded-xl', errors.name && 'border-destructive')}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="alex@email.com"
                value={get('email')}
                onChange={(e) => set('email', e.target.value)}
                className={cn('h-12 rounded-xl', errors.email && 'border-destructive')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={get('phone')}
                onChange={(e) => set('phone', e.target.value)}
                className="h-12 rounded-xl"
              />
            </div>
          </div>
        );

      // ── Step 2: Move Timing ──
      case 2:
        return (
          <div className="space-y-4">
            <StepHeader title="When are you planning to move?" />
            <div className="space-y-2.5">
              {[
                { value: 'asap', label: 'ASAP (within 2 weeks)' },
                { value: '30days', label: 'Within 30 days' },
                { value: '1-2months', label: '1-2 months' },
                { value: 'browsing', label: 'Just browsing' },
              ].map((option) => (
                <SelectionCard
                  key={option.value}
                  label={option.label}
                  selected={get('moveTiming') === option.value}
                  onClick={() => set('moveTiming', option.value)}
                  accentColor={accentColor}
                />
              ))}
            </div>
            {errors.moveTiming && <p className="text-xs text-destructive">{errors.moveTiming}</p>}
          </div>
        );

      // ── Step 3: Location ──
      case 3:
        return (
          <div className="space-y-4">
            <StepHeader title="Where are you looking to live?" />
            <div className="space-y-1.5">
              <Input
                id="location"
                type="text"
                placeholder="e.g., Downtown Miami, Brickell"
                value={get('location')}
                onChange={(e) => set('location', e.target.value)}
                className={cn('h-12 rounded-xl', errors.location && 'border-destructive')}
              />
              {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
            </div>
          </div>
        );

      // ── Step 4: Budget ──
      case 4:
        return (
          <div className="space-y-4">
            <StepHeader title="What's your monthly rent budget?" />
            <div className="space-y-2.5">
              {[
                { value: 'under_1500', label: 'Under $1,500' },
                { value: '1500_2000', label: '$1,500 - $2,000' },
                { value: '2000_2500', label: '$2,000 - $2,500' },
                { value: '2500_3500', label: '$2,500 - $3,500' },
                { value: '3500_plus', label: '$3,500+' },
              ].map((option) => (
                <SelectionCard
                  key={option.value}
                  label={option.label}
                  selected={get('budget') === option.value}
                  onClick={() => set('budget', option.value)}
                  accentColor={accentColor}
                />
              ))}
            </div>
            {errors.budget && <p className="text-xs text-destructive">{errors.budget}</p>}
          </div>
        );

      // ── Step 5: Income ──
      case 5:
        return (
          <div className="space-y-4">
            <StepHeader title="What's your estimated monthly income?" />
            <div className="space-y-2.5">
              {[
                { value: 'under_2000', label: 'Under $2,000' },
                { value: '2000_3000', label: '$2,000 - $3,000' },
                { value: '3000_4000', label: '$3,000 - $4,000' },
                { value: '4000_6000', label: '$4,000 - $6,000' },
                { value: '6000_plus', label: '$6,000+' },
              ].map((option) => (
                <SelectionCard
                  key={option.value}
                  label={option.label}
                  selected={get('income') === option.value}
                  onClick={() => set('income', option.value)}
                  accentColor={accentColor}
                />
              ))}
            </div>
            {errors.income && <p className="text-xs text-destructive">{errors.income}</p>}
          </div>
        );

      // ── Step 6: Employment ──
      case 6:
        return (
          <div className="space-y-4">
            <StepHeader title="What's your current work situation?" />
            <div className="space-y-2.5">
              {[
                { value: 'full-time', label: 'Full-time employed' },
                { value: 'self-employed', label: 'Self-employed' },
                { value: 'part-time', label: 'Part-time employed' },
                { value: 'student', label: 'Student' },
                { value: 'not-employed', label: 'Not currently employed' },
              ].map((option) => (
                <SelectionCard
                  key={option.value}
                  label={option.label}
                  selected={get('employment') === option.value}
                  onClick={() => set('employment', option.value)}
                  accentColor={accentColor}
                />
              ))}
            </div>
            {errors.employment && <p className="text-xs text-destructive">{errors.employment}</p>}
          </div>
        );

      // ── Step 7: Household ──
      case 7:
        return (
          <div className="space-y-4">
            <StepHeader title="Tell us about your household" />
            <div className="space-y-1.5">
              <Label htmlFor="occupants">
                How many people will be living in the home? <span className="text-destructive">*</span>
              </Label>
              <Input
                id="occupants"
                type="number"
                min={1}
                placeholder="e.g., 2"
                value={get('occupants')}
                onChange={(e) => set('occupants', e.target.value)}
                className={cn('h-12 rounded-xl', errors.occupants && 'border-destructive')}
              />
              {errors.occupants && <p className="text-xs text-destructive">{errors.occupants}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Do you have pets?</Label>
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => set('hasPets', 'yes')}
                  className={cn(
                    'flex-1 px-4 py-3 rounded-xl border transition-all text-sm font-medium',
                    get('hasPets') === 'yes'
                      ? 'border-2 shadow-sm'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                  )}
                  style={get('hasPets') === 'yes' ? { borderColor: accentColor, backgroundColor: `${accentColor}08` } : undefined}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => set('hasPets', 'no')}
                  className={cn(
                    'flex-1 px-4 py-3 rounded-xl border transition-all text-sm font-medium',
                    get('hasPets') === 'no'
                      ? 'border-2 shadow-sm'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                  )}
                  style={get('hasPets') === 'no' ? { borderColor: accentColor, backgroundColor: `${accentColor}08` } : undefined}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        );

      // ── Step 8: Additional Info (Optional) ──
      case 8:
        return (
          <div className="space-y-4">
            <StepHeader
              title="Anything we should know?"
              description="This step is optional. Share anything that might help."
            />
            <div className="space-y-1.5">
              <Textarea
                id="notes"
                value={get('notes')}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Special requirements, preferences, questions..."
                rows={5}
                className="rounded-xl"
              />
            </div>
          </div>
        );

      // ── Step 9: Intent ──
      case 9:
        return (
          <div className="space-y-4">
            <StepHeader title="If you find the right place, are you ready to move forward?" />
            <div className="space-y-2.5">
              {[
                { value: 'ready', label: 'Yes, ready now' },
                { value: 'maybe', label: 'Maybe' },
                { value: 'exploring', label: 'Just exploring' },
              ].map((option) => (
                <SelectionCard
                  key={option.value}
                  label={option.label}
                  selected={get('intent') === option.value}
                  onClick={() => set('intent', option.value)}
                  accentColor={accentColor}
                />
              ))}
            </div>
            {errors.intent && <p className="text-xs text-destructive">{errors.intent}</p>}
            {/* Privacy consent — shows if realtor has a privacy policy URL set */}
            {customization?.privacyPolicyUrl && (
              <div className="flex items-start gap-3 mt-4 p-3 rounded-lg border border-border bg-muted/30">
                <input
                  type="checkbox"
                  id="privacy-consent"
                  checked={get('privacyConsent') === 'true'}
                  onChange={(e) => set('privacyConsent', e.target.checked ? 'true' : 'false')}
                  className="mt-0.5 rounded border-border cursor-pointer"
                  required
                />
                <label htmlFor="privacy-consent" className="text-sm text-foreground leading-snug cursor-pointer">
                  {customization.consentCheckboxLabel || (
                    <>
                      I agree to {businessName}&apos;s{' '}
                      <a href={customization.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                        Privacy Policy
                      </a>
                    </>
                  )}
                </label>
              </div>
            )}
            {/* Chippi TOS + Privacy — always shown */}
            <div className="flex items-start gap-3 mt-2 p-3 rounded-lg border border-border bg-muted/30">
              <input
                type="checkbox"
                id="chippi-tos"
                checked={get('chippiTosConsent') === 'true'}
                onChange={(e) => set('chippiTosConsent', e.target.checked ? 'true' : 'false')}
                className="mt-0.5 rounded border-border cursor-pointer"
                required
              />
              <label htmlFor="chippi-tos" className="text-sm text-muted-foreground leading-snug cursor-pointer">
                I agree to Chippi&apos;s{' '}
                <a href="https://usechippi.com/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="https://usechippi.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                  Privacy Policy
                </a>
              </label>
            </div>
            {errors.privacyConsent && <p className="text-xs text-destructive mt-1">{errors.privacyConsent}</p>}
            {errors.chippiTosConsent && <p className="text-xs text-destructive mt-1">{errors.chippiTosConsent}</p>}
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div
      className={cn(
        'bg-card border border-border/40 shadow-lg shadow-black/[0.03] overflow-hidden',
        radiusClass,
        fontClass,
        customization?.darkMode && 'dark',
      )}
      style={{ '--intake-accent': accentColor } as React.CSSProperties}
    >
      {/* Video embed */}
      {embedUrl && (
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            src={embedUrl}
            title="Introduction video"
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Progress */}
      <div className="px-5 pt-5 pb-3 md:px-7 space-y-3 border-b border-border/30">
        <ProgressBar current={currentStepIndex + 1} total={totalSteps} accentColor={accentColor} />
        <StepIndicator current={step} steps={STEPS} accentColor={accentColor} />
      </div>

      {/* Step content */}
      <div className="px-5 py-6 md:px-8 md:py-8 overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -60, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="px-5 pb-6 md:px-8 md:pb-8 pt-2">
        {submitError && (
          <p className="text-sm text-destructive mb-3">{submitError}</p>
        )}
        <div className="flex gap-3">
          {currentStepIndex > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              className="flex-shrink-0 rounded-full px-5"
            >
              <ChevronLeft size={15} className="mr-1" />
              Back
            </Button>
          )}
          <div className="flex-1" />
          {currentStepIndex < totalSteps - 1 ? (
            <Button
              type="button"
              onClick={goNext}
              className="flex-shrink-0 rounded-full px-6 text-white shadow-md hover:shadow-lg transition-shadow"
              style={{ backgroundColor: accentColor }}
            >
              Continue
              <ChevronRight size={15} className="ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              size="lg"
              className="flex-1 sm:flex-none rounded-full px-8 text-white shadow-md hover:shadow-lg transition-shadow"
              style={{ backgroundColor: accentColor }}
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
