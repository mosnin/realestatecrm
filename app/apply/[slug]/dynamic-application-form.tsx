'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  Loader2,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Home,
  Key,
} from 'lucide-react';
import type { IntakeFormConfig, FormSection, FormQuestion } from '@/lib/types';
import type { IntakeCustomization } from './application-form';
import {
  QuestionRenderer,
  validateQuestion,
} from '@/components/form-renderer/question-renderer';

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'chippi_dynamic_';

// ── Types ────────────────────────────────────────────────────────────────────

type AnswerMap = Record<string, string | string[]>;

// ── Helper: localStorage draft management ────────────────────────────────────

function getStorageKey(slug: string, version: number) {
  return `${STORAGE_KEY_PREFIX}${slug}_v${version}`;
}

function loadDraft(slug: string, version: number): { data: AnswerMap; stale: boolean } {
  if (typeof window === 'undefined') return { data: {}, stale: false };
  try {
    // Try loading draft for this exact version
    const raw = localStorage.getItem(getStorageKey(slug, version));
    if (raw) return { data: JSON.parse(raw), stale: false };

    // Check if there's a draft from an older version
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${STORAGE_KEY_PREFIX}${slug}_v`) && key !== getStorageKey(slug, version)) {
        const oldRaw = localStorage.getItem(key);
        if (oldRaw) {
          // Return old data but flag it as stale
          localStorage.removeItem(key);
          return { data: JSON.parse(oldRaw), stale: true };
        }
      }
    }

    return { data: {}, stale: false };
  } catch {
    return { data: {}, stale: false };
  }
}

function saveDraft(slug: string, version: number, data: AnswerMap) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(slug, version), JSON.stringify(data));
  } catch {
    // localStorage may be full or unavailable
  }
}

function clearDraft(slug: string, version: number) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getStorageKey(slug, version));
  } catch {}
}

// ── Theming maps ─────────────────────────────────────────────────────────────

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

// ── Parse embed URL ──────────────────────────────────────────────────────────

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
      const id = u.hostname.includes('youtu.be')
        ? u.pathname.slice(1)
        : u.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes('loom.com')) {
      const match = u.pathname.match(/\/share\/([a-zA-Z0-9]+)/);
      return match ? `https://www.loom.com/embed/${match[1]}` : null;
    }
    return url;
  } catch {
    return null;
  }
}

// ── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  current,
  total,
  accentColor,
}: {
  current: number;
  total: number;
  accentColor?: string;
}) {
  const pct = Math.round((current / total) * 100);
  const color = accentColor || 'hsl(var(--primary))';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
        <span>
          Step {current} of {total}
        </span>
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

// ── Step indicator (compact on mobile) ───────────────────────────────────────

function StepIndicator({
  current,
  sections,
  accentColor,
}: {
  current: number;
  sections: FormSection[];
  accentColor?: string;
}) {
  const color = accentColor || 'hsl(var(--primary))';
  return (
    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      {sections.map((section, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <div
            key={section.id}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0',
              !isActive && !isDone && 'text-muted-foreground/60',
              isDone && 'text-muted-foreground',
            )}
            style={
              isActive
                ? { backgroundColor: color, color: '#fff' }
                : isDone
                  ? { backgroundColor: `${color}15`, color }
                  : undefined
            }
          >
            <span className="w-3 text-center">{stepNum}</span>
            <span className="hidden sm:inline">{section.title}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Step header ──────────────────────────────────────────────────────────────

function StepHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1.5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ── Lead type selector (matches legacy form's two-card Getting Started step) ─

/**
 * Detect whether a question is a "lead type" selector.
 * Convention: question.id === 'leadType', or it's a radio/select with
 * options whose values include 'rental' and 'buyer'.
 */
function isLeadTypeQuestion(question: FormQuestion): boolean {
  if (question.id === 'leadType') return true;
  if (question.type !== 'radio' && question.type !== 'select') return false;
  const values = (question.options ?? []).map((o) => o.value);
  return values.includes('rental') && values.includes('buyer');
}

function LeadTypeSelector({
  question,
  value,
  onChange,
  error,
  accentColor,
}: {
  question: FormQuestion;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  accentColor: string;
}) {
  const options = question.options ?? [];
  // Map known values to icons, fall back to generic
  const iconMap: Record<string, typeof Home> = {
    rental: Home,
    buyer: Key,
    buy: Key,
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-destructive">{error}</p>}
      {options.map((option) => {
        const Icon = iconMap[option.value] || Home;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'w-full flex items-center gap-4 px-5 py-5 rounded-xl border-2 transition-all text-left',
              selected
                ? 'shadow-sm font-medium'
                : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
            )}
            style={
              selected
                ? { borderColor: accentColor, backgroundColor: `${accentColor}08` }
                : undefined
            }
          >
            <Icon
              size={24}
              className="flex-shrink-0"
              style={selected ? { color: accentColor } : undefined}
            />
            <span className="text-sm">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Conditional visibility evaluator ─────────────────────────────────────────

function evaluateVisibility(
  condition: { questionId: string; operator: 'equals' | 'not_equals' | 'contains'; value: string } | undefined,
  answers: AnswerMap,
): boolean {
  if (!condition) return true;

  const { questionId, operator, value: targetValue } = condition;
  const currentAnswer = answers[questionId];
  const strAnswer = Array.isArray(currentAnswer)
    ? currentAnswer.join(',')
    : currentAnswer ?? '';

  switch (operator) {
    case 'equals':
      return strAnswer === targetValue;
    case 'not_equals':
      return strAnswer !== targetValue;
    case 'contains':
      return strAnswer.includes(targetValue);
    default:
      return true;
  }
}

function isQuestionVisible(
  question: FormQuestion,
  answers: AnswerMap,
): boolean {
  return evaluateVisibility(question.visibleWhen, answers);
}

function isSectionVisible(
  section: FormSection,
  answers: AnswerMap,
): boolean {
  return evaluateVisibility(section.visibleWhen, answers);
}

// ── Main component ───────────────────────────────────────────────────────────

export function DynamicApplicationForm({
  slug,
  businessName,
  formConfig,
  customization,
  brokerageId,
}: {
  slug: string;
  businessName: string;
  formConfig: IntakeFormConfig;
  customization?: IntakeCustomization;
  brokerageId?: string;
}) {
  // Sort sections and questions by position
  const sections = [...formConfig.sections].sort((a, b) => a.position - b.position);
  const allSortedSections = sections.map((s) => ({
    ...s,
    questions: [...s.questions].sort((a, b) => a.position - b.position),
  }));

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<AnswerMap>(() => {
    const { data } = loadDraft(slug, formConfig.version);
    return data;
  });
  const [staleDraft, setStaleDraft] = useState(() => {
    const { stale } = loadDraft(slug, formConfig.version);
    return stale;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const confettiRef = useRef<ConfettiRef>(null);
  const [scoreState, setScoreState] = useState<{
    id?: string;
    applicationRef?: string;
  } | null>(null);
  const submissionLockRef = useRef(false);

  // ── Compute visible sections based on current answers ─────────────────────

  const sortedSections = allSortedSections.filter((s) => isSectionVisible(s, answers));
  const totalSteps = sortedSections.length;

  // Track previously visible section IDs to detect when sections become hidden
  const prevVisibleSectionIdsRef = useRef<Set<string>>(
    new Set(sortedSections.map((s) => s.id)),
  );

  // Clear answers from sections that became hidden
  useEffect(() => {
    const currentVisibleIds = new Set(sortedSections.map((s) => s.id));
    const prevVisibleIds = prevVisibleSectionIdsRef.current;

    // Find sections that were visible but are now hidden
    const nowHiddenIds = new Set<string>();
    prevVisibleIds.forEach((id) => {
      if (!currentVisibleIds.has(id)) nowHiddenIds.add(id);
    });

    if (nowHiddenIds.size > 0) {
      // Get question IDs from the now-hidden sections
      const hiddenQuestionIds = allSortedSections
        .filter((s) => nowHiddenIds.has(s.id))
        .flatMap((s) => s.questions.map((q) => q.id));

      if (hiddenQuestionIds.length > 0) {
        setAnswers((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const qId of hiddenQuestionIds) {
            if (qId in next) {
              delete next[qId];
              changed = true;
            }
          }
          if (changed) {
            debouncedSave(next);
          }
          return changed ? next : prev;
        });
      }
    }

    prevVisibleSectionIdsRef.current = currentVisibleIds;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedSections.map((s) => s.id).join(',')]);

  // Clamp currentStep if sections were hidden
  useEffect(() => {
    if (currentStep > totalSteps && totalSteps > 0) {
      setCurrentStep(totalSteps);
    }
  }, [currentStep, totalSteps]);

  // ── Answer accessors ───────────────────────────────────────────────────────

  const getAnswer = useCallback(
    (questionId: string): string | string[] => answers[questionId] ?? '',
    [answers],
  );

  // Debounce localStorage saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback(
    (data: AnswerMap) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => saveDraft(slug, formConfig.version, data),
        500,
      );
    },
    [slug, formConfig.version],
  );

  const setAnswer = useCallback(
    (questionId: string, value: string | string[]) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        debouncedSave(next);
        return next;
      });
      setErrors((prev) => {
        if (prev[questionId]) {
          const next = { ...prev };
          delete next[questionId];
          return next;
        }
        return prev;
      });
    },
    [debouncedSave],
  );

  // Dismiss stale draft notice
  const dismissStaleNotice = useCallback(() => setStaleDraft(false), []);

  // ── Validation ─────────────────────────────────────────────────────────────

  function validateCurrentStep(): boolean {
    const section = sortedSections[currentStep - 1];
    if (!section) return true;

    const errs: Record<string, string> = {};
    const isLastStep = currentStep === totalSteps;

    for (const question of section.questions) {
      // Skip hidden questions
      if (!isQuestionVisible(question, answers)) continue;

      const val = answers[question.id];
      const error = validateQuestion(question, val);
      if (error) {
        errs[question.id] = error;
      }
    }

    // On the last step, validate consent checkboxes
    if (isLastStep) {
      if (
        customization?.privacyPolicyUrl &&
        answers['privacyConsent'] !== 'true'
      ) {
        errs['privacyConsent'] = 'You must agree to the privacy policy';
      }
      if (answers['chippiTosConsent'] !== 'true') {
        errs['chippiTosConsent'] =
          "You must agree to Chippi's Terms of Service and Privacy Policy";
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goNext() {
    if (!validateCurrentStep()) return;
    if (currentStep < totalSteps) {
      setDirection(1);
      setCurrentStep((s) => s + 1);
    }
  }

  function goBack() {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((s) => s - 1);
    }
  }

  // ── Submission ─────────────────────────────────────────────────────────────

  async function onSubmit() {
    if (!validateCurrentStep()) return;
    if (submitting || submissionLockRef.current) return;

    submissionLockRef.current = true;
    setSubmitting(true);
    setSubmitError('');

    // Map system fields to top-level for API compatibility
    const systemName =
      typeof answers['name'] === 'string' ? answers['name'] : '';
    const systemEmail =
      typeof answers['email'] === 'string' ? answers['email'] : '';
    const systemPhone =
      typeof answers['phone'] === 'string' ? answers['phone'] : '';

    // Build a flat answers record (only from visible sections, convert arrays to comma-separated strings for API compat)
    const visibleQuestionIds = new Set(
      sortedSections.flatMap((s) =>
        s.questions.filter((q) => isQuestionVisible(q, answers)).map((q) => q.id),
      ),
    );
    const flatAnswers: Record<string, string> = {};
    for (const [key, val] of Object.entries(answers)) {
      if (key === 'privacyConsent' || key === 'chippiTosConsent') continue;
      if (!visibleQuestionIds.has(key)) continue;
      flatAnswers[key] = Array.isArray(val) ? val.join(',') : val;
    }

    const payload: Record<string, unknown> = {
      slug,
      leadType: formConfig.leadType === 'general' ? 'rental' : formConfig.leadType,
      legalName: systemName,
      email: systemEmail,
      phone: systemPhone,
      // Pass all answers as additional notes / structured data via applicationData override fields
      additionalNotes: flatAnswers['additionalNotes'] || flatAnswers['notes'] || undefined,
      // Map common fields the API expects
      targetMoveInDate: flatAnswers['targetMoveInDate'] || flatAnswers['moveTiming'] || undefined,
      propertyAddress: flatAnswers['propertyAddress'] || flatAnswers['location'] || undefined,
      monthlyRent: flatAnswers['monthlyRent'] || flatAnswers['budget'] || undefined,
      monthlyGrossIncome: flatAnswers['monthlyGrossIncome'] || flatAnswers['income'] || undefined,
      employmentStatus: flatAnswers['employmentStatus'] || flatAnswers['employment'] || undefined,
      numberOfOccupants: flatAnswers['numberOfOccupants'] || flatAnswers['occupants'] || undefined,
      buyerBudget: flatAnswers['buyerBudget'] || undefined,
      preApprovalStatus: flatAnswers['preApprovalStatus'] || undefined,
      propertyType: flatAnswers['propertyType'] || undefined,
      buyerTimeline: flatAnswers['buyerTimeline'] || undefined,
      // Consent
      ...(customization?.privacyPolicyUrl
        ? { privacyConsent: answers['privacyConsent'] === 'true' }
        : {}),
      // Dynamic form metadata
      formConfigVersion: formConfig.version,
      answers: flatAnswers,
      completedSteps: sortedSections.map((_, i) => i + 1), // only visible steps
    };

    if (brokerageId) {
      payload.brokerageId = brokerageId;
    }

    try {
      const endpoint = brokerageId
        ? '/api/public/apply/brokerage'
        : '/api/public/apply';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({}));
        setScoreState(result);
        setSubmitted(true);
        setTimeout(() => {
          confettiRef.current?.fire({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
          });
          confettiRef.current?.fire({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
          });
          confettiRef.current?.fire({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
          });
        }, 300);
        clearDraft(slug, formConfig.version);
      } else {
        const body = await response.json().catch(() => ({}));
        setSubmitError(
          body?.error || 'Something went wrong. Please try again.',
        );
      }
    } catch {
      setSubmitError('Unable to submit. Check your connection and try again.');
    } finally {
      setSubmitting(false);
      submissionLockRef.current = false;
    }
  }

  // ── Processing overlay ─────────────────────────────────────────────────────

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
          <p className="text-sm font-medium text-foreground">
            Processing your application...
          </p>
          <p className="text-xs text-muted-foreground">
            This will only take a moment
          </p>
        </motion.div>
      </motion.div>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <>
        <Confetti
          ref={confettiRef}
          manualstart
          className="pointer-events-none fixed inset-0 z-[9999] w-full h-full"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="rounded-xl bg-card border border-border/60 shadow-sm p-6 md:p-8 text-center space-y-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              delay: 0.2,
              type: 'spring',
              stiffness: 200,
              damping: 15,
            }}
            className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto"
          >
            <CheckCircle2
              size={28}
              className="text-green-600 dark:text-green-400"
            />
          </motion.div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-foreground">
              {customization?.thankYouTitle || 'Application received'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {customization?.thankYouMessage ||
                `${businessName} will review your application and follow up shortly.`}
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
        </motion.div>
      </>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const radiusClass =
    RADIUS_CLASS_MAP[customization?.borderRadius || 'rounded'] || 'rounded-xl';
  const fontClass =
    FONT_CLASS_MAP[customization?.font || 'system'] || '';
  const accentColor = customization?.accentColor || '#ff964f';
  const embedUrl = customization?.videoUrl
    ? toEmbedUrl(customization.videoUrl)
    : null;

  const currentSection = sortedSections[currentStep - 1];
  const isLastStep = currentStep === totalSteps;

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
        <ProgressBar
          current={currentStep}
          total={totalSteps}
          accentColor={accentColor}
        />
        <StepIndicator
          current={currentStep}
          sections={sortedSections}
          accentColor={accentColor}
        />
      </div>

      {/* Stale draft notice */}
      {staleDraft && (
        <div className="mx-5 mt-4 md:mx-8 flex items-start gap-3 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30">
          <AlertTriangle
            size={16}
            className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
          />
          <div className="flex-1">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              The form has been updated since your last visit. Your previous
              answers have been carried over where possible, but you may need to
              review them.
            </p>
            <button
              type="button"
              onClick={dismissStaleNotice}
              className="text-xs text-amber-600 dark:text-amber-400 underline mt-1"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="px-5 py-6 md:px-8 md:py-8 overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            initial={{ x: direction * 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -60, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
          >
            {currentSection && (
              <div className="space-y-5">
                <StepHeader
                  title={currentSection.title}
                  description={currentSection.description}
                />
                {currentSection.questions
                  .filter((q) => isQuestionVisible(q, answers))
                  .map((question) =>
                    isLeadTypeQuestion(question) ? (
                      <LeadTypeSelector
                        key={question.id}
                        question={question}
                        value={
                          typeof getAnswer(question.id) === 'string'
                            ? (getAnswer(question.id) as string)
                            : ''
                        }
                        onChange={(val) => setAnswer(question.id, val)}
                        error={errors[question.id]}
                        accentColor={accentColor}
                      />
                    ) : (
                      <QuestionRenderer
                        key={question.id}
                        question={question}
                        value={getAnswer(question.id)}
                        onChange={(val) => setAnswer(question.id, val)}
                        error={errors[question.id]}
                        accentColor={accentColor}
                      />
                    ),
                  )}

                {/* Consent checkboxes on the last step */}
                {isLastStep && (
                  <div className="flex items-start gap-3 mt-4 p-3 rounded-lg border border-border bg-muted/30">
                    <input
                      type="checkbox"
                      id="combined-consent-dynamic"
                      checked={
                        getAnswer('chippiTosConsent') === 'true'
                      }
                      onChange={(e) => {
                        const v = e.target.checked ? 'true' : 'false';
                        setAnswer('chippiTosConsent', v);
                        setAnswer('privacyConsent', v);
                      }}
                      className="mt-0.5 rounded border-border cursor-pointer"
                      required
                    />
                    <label
                      htmlFor="combined-consent-dynamic"
                      className="text-sm text-muted-foreground leading-snug cursor-pointer"
                    >
                      I agree to Chippi&apos;s{' '}
                      <a
                        href="/legal/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                      >
                        Terms of Service
                      </a>{' '}
                      and{' '}
                      <a
                        href="/legal/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline hover:text-primary/80"
                      >
                        Privacy Policy
                      </a>
                      {customization?.privacyPolicyUrl && (
                        <>
                          {' '}
                          and {businessName}&apos;s{' '}
                          <a
                            href={customization.privacyPolicyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary underline hover:text-primary/80"
                          >
                            Privacy Policy
                          </a>
                        </>
                      )}
                    </label>
                  </div>
                )}
                {isLastStep && errors['chippiTosConsent'] && (
                  <p className="text-xs text-destructive mt-1">
                    {errors['chippiTosConsent']}
                  </p>
                )}
                {isLastStep && errors['privacyConsent'] && (
                  <p className="text-xs text-destructive mt-1">
                    {errors['privacyConsent']}
                  </p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="px-5 pb-6 md:px-8 md:pb-8 pt-2">
        {submitError && (
          <p className="text-sm text-destructive mb-3">{submitError}</p>
        )}
        <div className="flex gap-3">
          {currentStep > 1 && (
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
          {!isLastStep ? (
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
