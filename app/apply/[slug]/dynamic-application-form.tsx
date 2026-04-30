'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { DEFAULT_RENTAL_FORM_CONFIG, DEFAULT_BUYER_FORM_CONFIG } from '@/lib/form-builder';
import { cn } from '@/lib/utils';
import { pickContrastColor } from '@/lib/color';
import {
  Check,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  AlertTriangle,
  Home,
  Key,
  Cloud,
  CloudOff,
  XCircle,
} from 'lucide-react';
import type { IntakeFormConfig, FormSection, FormQuestion } from '@/lib/types';
import type { IntakeCustomization } from './application-form';
import {
  QuestionRenderer,
  validateQuestion,
} from '@/components/form-renderer/question-renderer';
import {
  trackFormStart,
  trackStepView,
  trackStepComplete,
  trackFormSubmit,
  setupAbandonTracking,
} from '@/lib/form-analytics-client';
import { fireConversionEvents } from '@/lib/tracking-events';
import { PRIMARY_PILL, SECTION_LABEL, TITLE_FONT } from '@/lib/typography';

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'chippi_dynamic_';

/**
 * Per-question-type time estimate in seconds. Calibrated to "realtor reads,
 * thinks, types/taps a real answer" — not a stopwatch on a robot. Long-form
 * answers and multi-select dominate; single-tap selectors are cheap.
 *
 * If a new question type is added without updating this map, the estimator
 * falls back to 10s per question — middle of the road.
 */
const QUESTION_TIME_SECONDS: Record<string, number> = {
  text: 12,
  textarea: 60,
  email: 8,
  phone: 8,
  number: 8,
  date: 10,
  select: 5,
  radio: 5,
  multi_select: 15,
  checkbox: 5,
};

function estimateMinutes(questions: FormQuestion[]): number {
  const totalSeconds = questions.reduce(
    (sum, q) => sum + (QUESTION_TIME_SECONDS[q.type] ?? 10),
    0,
  );
  return Math.max(1, Math.ceil(totalSeconds / 60));
}

// ── Types ────────────────────────────────────────────────────────────────────

type AnswerMap = Record<string, string | string[]>;

// ── Helper: sessionStorage draft management ──────────────────────────────────

function getStorageKey(slug: string, version: number) {
  return `${STORAGE_KEY_PREFIX}${slug}_v${version}`;
}

function loadDraft(slug: string, version: number): { data: AnswerMap; stale: boolean } {
  if (typeof window === 'undefined') return { data: {}, stale: false };
  try {
    // Try loading draft for this exact version
    const raw = sessionStorage.getItem(getStorageKey(slug, version));
    if (raw) return { data: JSON.parse(raw), stale: false };

    // Check if there's a draft from an older version
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(`${STORAGE_KEY_PREFIX}${slug}_v`) && key !== getStorageKey(slug, version)) {
        const oldRaw = sessionStorage.getItem(key);
        if (oldRaw) {
          // Return old data but flag it as stale
          sessionStorage.removeItem(key);
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
    sessionStorage.setItem(getStorageKey(slug, version), JSON.stringify(data));
  } catch {
    // sessionStorage may be full or unavailable
  }
}

function clearDraft(slug: string, version: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(getStorageKey(slug, version));
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

// ── Dot stepper — quiet, paper-flat ──────────────────────────────────────────

function DotStepper({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <nav
      aria-label="Form steps"
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }).map((_, idx) => {
        const stepNum = idx + 1;
        const isActive = stepNum === current;
        const isDone = stepNum < current;
        return (
          <motion.span
            key={idx}
            layout
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn(
              'h-1.5 rounded-full transition-colors',
              isActive && 'w-6 bg-foreground',
              isDone && 'w-1.5 bg-foreground/40',
              !isActive && !isDone && 'w-1.5 bg-foreground/15',
            )}
            aria-current={isActive ? 'step' : undefined}
          />
        );
      })}
    </nav>
  );
}

// ── Step header — quiet section label + optional description ─────────────────

function StepHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <p className={SECTION_LABEL}>{title}</p>
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
}: {
  question: FormQuestion;
  value: string;
  onChange: (val: string) => void;
  error?: string;
}) {
  const options = question.options ?? [];
  // Map known values to icons, fall back to generic
  const iconMap: Record<string, typeof Home> = {
    rental: Home,
    buyer: Key,
    buy: Key,
  };

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}
      {options.map((option) => {
        const Icon = iconMap[option.value] || Home;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-4 rounded-lg border text-left transition-colors',
              selected
                ? 'border-foreground/40 bg-foreground/[0.045] ring-2 ring-foreground/10'
                : 'border-border/70 hover:bg-foreground/[0.04]',
            )}
          >
            <Icon size={18} className="flex-shrink-0 text-muted-foreground" />
            <span className="text-sm text-foreground">{option.label}</span>
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

// ── Inline save notification (ephemeral toast) ─────────────────────────────

function SaveNotification({
  message,
  visible,
}: {
  message: string;
  visible: boolean;
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-foreground text-background text-xs font-medium max-w-[90vw]"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Persistent save status indicator (Apple-style, always visible) ──────────

function SaveStatusIndicator({
  status,
}: {
  status: 'idle' | 'saving' | 'saved' | 'error';
}) {
  if (status === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {status === 'saving' && (
        <>
          <Loader2 size={11} className="animate-spin" />
          <span>Saving</span>
        </>
      )}
      {status === 'saved' && (
        <>
          <Cloud size={11} className="text-emerald-600 dark:text-emerald-400" />
          <span>Saved</span>
        </>
      )}
      {status === 'error' && (
        <>
          <CloudOff size={11} className="text-rose-600 dark:text-rose-400" />
          <span>Save failed</span>
        </>
      )}
    </div>
  );
}

// ── Resume banner ───────────────────────────────────────────────────────────

function ResumeBanner({
  visible,
  onDismiss,
  currentStep,
  totalSteps,
  answeredCount,
}: {
  visible: boolean;
  onDismiss: () => void;
  currentStep: number;
  totalSteps: number;
  answeredCount: number;
}) {
  if (!visible) return null;
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-border/70 bg-foreground/[0.025] mb-6">
      <CheckCircle2
        size={14}
        className="text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          Welcome back. Your progress has been restored.
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {answeredCount} {answeredCount === 1 ? 'answer' : 'answers'} restored
          {totalSteps > 1 && <> &middot; step {currentStep} of {totalSteps}</>}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── Resume error banner (expired link, already submitted, etc.) ─────────────

function ResumeErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border border-border/70 bg-foreground/[0.025] mb-6">
      <XCircle
        size={14}
        className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function DynamicApplicationForm({
  slug,
  spaceId,
  businessName,
  formConfig,
  rentalFormConfig,
  buyerFormConfig,
  customization,
  brokerageId,
  resumeToken,
}: {
  slug: string;
  spaceId?: string;
  businessName: string;
  /** @deprecated Use rentalFormConfig/buyerFormConfig instead. Kept for backwards compat. */
  formConfig?: IntakeFormConfig;
  rentalFormConfig?: IntakeFormConfig | null;
  buyerFormConfig?: IntakeFormConfig | null;
  customization?: IntakeCustomization;
  brokerageId?: string;
  resumeToken?: string;
}) {
  // ── Resolve which config to use based on lead type selection ──
  // If dual configs are provided, we show a Getting Started step first.
  // If only legacy formConfig is provided, use it directly (backwards compat).
  const hasDualConfigs = rentalFormConfig != null || buyerFormConfig != null;

  const [selectedLeadType, setSelectedLeadType] = useState<'rental' | 'buyer' | null>(null);

  // Determine the active form config
  const activeFormConfig = (() => {
    if (hasDualConfigs) {
      if (selectedLeadType === 'buyer') return buyerFormConfig ?? DEFAULT_BUYER_FORM_CONFIG;
      if (selectedLeadType === 'rental') return rentalFormConfig ?? DEFAULT_RENTAL_FORM_CONFIG;
      // Not yet selected — show rental config as placeholder (user will pick on Getting Started)
      if (rentalFormConfig) return rentalFormConfig;
      if (buyerFormConfig) return buyerFormConfig;
      return DEFAULT_RENTAL_FORM_CONFIG;
    }
    // Fallback: use legacy formConfig or a safe empty config to prevent crashes
    // when neither formConfig nor dual configs are provided.
    return formConfig ?? {
      version: 1,
      leadType: 'rental' as const,
      sections: [],
    };
  })();

  // Sort sections and questions by position
  const sections = [...activeFormConfig.sections].sort((a, b) => a.position - b.position);
  const allSortedSections = sections.map((s) => ({
    ...s,
    questions: [...s.questions].sort((a, b) => a.position - b.position),
  }));

  const [currentStep, setCurrentStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const configVersion = activeFormConfig.version;
  const [initialDraft] = useState(() => loadDraft(slug, configVersion));
  const [answers, setAnswers] = useState<AnswerMap>(() => initialDraft.data);
  const [staleDraft, setStaleDraft] = useState(() => initialDraft.stale);
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

  // ── Server-side draft auto-save state ─────────────────────────────────────

  const [saveNotification, setSaveNotification] = useState('');
  const [showSaveNotification, setShowSaveNotification] = useState(false);
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [resumeError, setResumeError] = useState('');
  // Persistent save status: 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const hasShownEmailNoticeRef = useRef(false);
  const lastServerSaveRef = useRef<number>(0);
  const lastSavedAnswersRef = useRef<string>('');
  const answersRef = useRef<AnswerMap>(answers);
  answersRef.current = answers;
  const currentStepForSaveRef = useRef(currentStep);
  currentStepForSaveRef.current = currentStep;

  // Show a temporary notification
  const showNotification = useCallback((msg: string, durationMs = 3000) => {
    setSaveNotification(msg);
    setShowSaveNotification(true);
    setTimeout(() => setShowSaveNotification(false), durationMs);
  }, []);

  // Save draft to server with error feedback and dirty-checking
  const saveToServer = useCallback(async (force = false) => {
    if (!spaceId) return;
    const email = typeof answersRef.current['email'] === 'string' ? answersRef.current['email'] : '';
    if (!email || !email.includes('@')) return; // Need valid email for server save

    // Skip save if answers haven't changed since last successful save (unless forced)
    const answersSnapshot = JSON.stringify(answersRef.current);
    if (!force && answersSnapshot === lastSavedAnswersRef.current) return;

    setSaveStatus('saving');

    try {
      const res = await fetch('/api/form-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spaceId,
          email,
          answers: answersRef.current,
          currentStep: currentStepForSaveRef.current,
          formConfigVersion: configVersion,
        }),
      });

      if (res.ok) {
        lastServerSaveRef.current = Date.now();
        lastSavedAnswersRef.current = answersSnapshot;
        setSaveStatus('saved');
        const data = await res.json();

        if (!data.updated && !hasShownEmailNoticeRef.current) {
          // First-time save — draft was created, email will be sent
          hasShownEmailNoticeRef.current = true;
          showNotification('Progress auto-saved. A resume link has been sent to your email.', 5000);
        } else {
          showNotification('Progress saved', 2000);
        }
      } else if (res.status === 429) {
        setSaveStatus('error');
        showNotification('Auto-save paused \u2014 too many saves. Your local progress is still safe.', 4000);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
      showNotification('Unable to save \u2014 check your connection. Your local progress is safe.', 4000);
    }
  }, [spaceId, configVersion, showNotification]);

  // Load draft from server when resumeToken is present
  useEffect(() => {
    if (!resumeToken) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/form-draft?token=${encodeURIComponent(resumeToken)}`);

        if (cancelled) return;

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 410) {
            // Expired or already submitted
            setResumeError(
              body.error === 'This application has already been submitted'
                ? 'This application was already submitted. You can start a new one below.'
                : 'This resume link has expired. You can start a new application below.'
            );
          } else if (res.status === 404) {
            setResumeError('This resume link is no longer valid. You can start a new application below.');
          }
          // Clean the resume token from URL so it can't leak via bookmark/share
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('resume');
            window.history.replaceState({}, '', url.toString());
          }
          return;
        }

        const data = await res.json();

        if (cancelled) return;

        if (data.answers && typeof data.answers === 'object') {
          const serverAnswers = data.answers as AnswerMap;

          // Merge strategy: if sessionStorage has more answers than the server
          // draft, prefer the version with more filled fields (user may have
          // continued typing after the last server save).
          const localDraft = loadDraft(slug, configVersion);
          const localCount = Object.keys(localDraft.data).filter((k) => localDraft.data[k] !== '' && localDraft.data[k]?.length !== 0).length;
          const serverCount = Object.keys(serverAnswers).filter((k) => serverAnswers[k] !== '' && (serverAnswers[k] as string | string[])?.length !== 0).length;

          const useServer = serverCount >= localCount;
          const mergedAnswers = useServer ? serverAnswers : { ...serverAnswers, ...localDraft.data };

          setAnswers(mergedAnswers);
          saveDraft(slug, configVersion, mergedAnswers);

          if (typeof data.currentStep === 'number' && data.currentStep > 0) {
            setCurrentStep(data.currentStep);
          }

          // Check if form config version changed
          if (data.formConfigVersion != null && data.formConfigVersion !== configVersion) {
            setStaleDraft(true);
          }

          setShowResumeBanner(true);
          hasShownEmailNoticeRef.current = true; // Don't show "check email" since they came from email
        }

        // Clean the resume token from URL to prevent leakage via bookmark/share
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('resume');
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        setResumeError('Unable to restore your progress. You can continue filling out the form below.');
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeToken]);

  // Auto-save to server every 30 seconds, but only when data has actually changed
  useEffect(() => {
    if (!spaceId) return;

    const interval = setInterval(() => {
      const email = typeof answersRef.current['email'] === 'string' ? answersRef.current['email'] : '';
      if (!email || !email.includes('@')) return;

      // Dirty-check: skip if nothing changed (saveToServer also checks, but
      // this avoids even calling the function and setting 'saving' status)
      const snapshot = JSON.stringify(answersRef.current);
      if (snapshot === lastSavedAnswersRef.current) return;

      saveToServer();
    }, 30000);

    return () => clearInterval(interval);
  }, [spaceId, saveToServer]);

  // ── Compute visible sections based on current answers ─────────────────────

  const sortedSections = allSortedSections.filter((s) => isSectionVisible(s, answers));
  // When using dual configs, step 1 is the Getting Started step (hardcoded)
  const gettingStartedOffset = hasDualConfigs ? 1 : 0;
  const totalSteps = sortedSections.length + gettingStartedOffset;

  // Track previously visible section IDs to detect when sections become hidden
  const prevVisibleSectionIdsRef = useRef<Set<string>>(
    new Set(sortedSections.map((s) => s.id)),
  );

  // Clear answers from sections that became hidden and notify the user
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
      const hiddenSections = allSortedSections.filter((s) => nowHiddenIds.has(s.id));
      const hiddenQuestionIds = hiddenSections.flatMap((s) => s.questions.map((q) => q.id));

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
            // Notify the user that some answers were cleared
            const sectionNames = hiddenSections.map((s) => s.title).join(', ');
            showNotification(
              `Your answers for ${sectionNames} ${hiddenSections.length === 1 ? 'have' : 'have'} been cleared because ${hiddenSections.length === 1 ? 'that step no longer applies' : 'those steps no longer apply'}.`,
              4000,
            );
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

  // ── Form analytics tracking ───────────────────────────────────────────────
  // Only track when spaceId is provided (dynamic forms only, not legacy)

  const submittedRef = useRef(false);
  const currentStepRef = useRef(currentStep);
  currentStepRef.current = currentStep;

  // Track form_start on mount
  useEffect(() => {
    if (!spaceId) return;
    trackFormStart(spaceId, configVersion);
    // Track initial step view
    const section = sortedSections[0];
    if (section) {
      trackStepView(spaceId, 0, section.title, configVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // Track step_view when currentStep changes
  const prevStepRef = useRef(currentStep);
  useEffect(() => {
    if (!spaceId) return;
    if (prevStepRef.current === currentStep) return;

    // Track completion of previous step
    // Account for the Getting Started offset: step 1 in dual-config mode is
    // "Getting Started" (not in sortedSections), so the section index is
    // (stepNumber - 1 - gettingStartedOffset).
    const prevSectionIdx = prevStepRef.current - 1 - gettingStartedOffset;
    const prevSection = prevSectionIdx >= 0 ? sortedSections[prevSectionIdx] : null;
    if (prevSection) {
      trackStepComplete(spaceId, prevSectionIdx, prevSection.title, configVersion);
    } else if (hasDualConfigs && prevStepRef.current === 1) {
      trackStepComplete(spaceId, 0, 'Getting Started', configVersion);
    }

    // Track view of new step
    const newSectionIdx = currentStep - 1 - gettingStartedOffset;
    const newSection = newSectionIdx >= 0 ? sortedSections[newSectionIdx] : null;
    if (newSection) {
      trackStepView(spaceId, newSectionIdx, newSection.title, configVersion);
    } else if (hasDualConfigs && currentStep === 1) {
      trackStepView(spaceId, 0, 'Getting Started', configVersion);
    }

    prevStepRef.current = currentStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, spaceId]);

  // Setup abandon tracking via beforeunload
  useEffect(() => {
    if (!spaceId) return;
    return setupAbandonTracking(
      spaceId,
      () => currentStepRef.current - 1,
      () => submittedRef.current,
      configVersion,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // ── Answer accessors ───────────────────────────────────────────────────────

  const getAnswer = useCallback(
    (questionId: string): string | string[] => answers[questionId] ?? '',
    [answers],
  );

  // Debounce sessionStorage saves
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback(
    (data: AnswerMap) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => saveDraft(slug, configVersion, data),
        500,
      );
    },
    [slug, configVersion],
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

  // Whether we're on the Getting Started step (only in dual config mode)
  const isOnGettingStarted = hasDualConfigs && currentStep === 1;
  // Map current step to section index (accounting for Getting Started offset)
  const sectionIndex = currentStep - 1 - gettingStartedOffset;

  function validateCurrentStep(): boolean {
    // Getting Started step: validate lead type selection
    if (isOnGettingStarted) {
      if (!selectedLeadType) {
        setErrors({ __leadType: 'Please select whether you are renting or buying.' });
        return false;
      }
      setErrors({});
      return true;
    }

    const section = sortedSections[sectionIndex];
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
      // Trigger server save after step navigation (non-blocking)
      saveToServer();
    }
  }

  function goBack() {
    if (currentStep > 1) {
      setDirection(-1);
      // If going back to Getting Started, clear answers from the config-specific sections
      // so the user can switch lead type cleanly
      if (hasDualConfigs && currentStep === 2) {
        // Going back to Getting Started — allow changing lead type
        // Don't clear answers yet; only clear if they actually change lead type
      }
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
    const flatAnswers: Record<string, string | string[]> = {};
    for (const [key, val] of Object.entries(answers)) {
      if (key === 'privacyConsent' || key === 'chippiTosConsent') continue;
      if (!visibleQuestionIds.has(key)) continue;
      // Preserve arrays for multi_select fields so the API Zod schema
      // (z.array(z.string())) validates correctly instead of receiving a
      // comma-joined string.
      flatAnswers[key] = val;
    }

    // Determine lead type for submission
    const resolvedLeadType = selectedLeadType || activeFormConfig.leadType;
    const submissionLeadType = resolvedLeadType === 'general' ? 'rental' : resolvedLeadType;

    const payload: Record<string, unknown> = {
      // Include all visible dynamic answers at top-level so server-side dynamic
      // schema validation (which is keyed by question.id) can validate custom
      // questions/sections end-to-end.
      ...flatAnswers,
      slug,
      leadType: submissionLeadType,
      formLeadType: submissionLeadType,
      // System fields: the dynamic Zod schema (buildDynamicSchema) expects
      // top-level 'name', 'email', 'phone' matching the system question IDs.
      // The legacy schema expects 'legalName'. Send both for compat.
      name: systemName,
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
      formConfigVersion: activeFormConfig.version,
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
        submittedRef.current = true;
        // Track form submission for analytics
        if (spaceId) {
          trackFormSubmit(spaceId, configVersion);
        }
        // Fire tracking pixel conversion events
        fireConversionEvents();
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
        clearDraft(slug, configVersion);
        // Mark server-side draft as completed (non-blocking)
        if (spaceId) {
          const draftEmail = typeof answers['email'] === 'string' ? answers['email'] : '';
          if (draftEmail && draftEmail.includes('@')) {
            fetch('/api/form-draft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                spaceId,
                email: draftEmail,
                answers,
                currentStep: totalSteps,
                formConfigVersion: configVersion,
                completed: true,
              }),
            }).catch(() => {});
          }
        }
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
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-xl bg-background border border-border/70 p-6 text-center space-y-3"
        >
          <Loader2 size={20} className="animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-foreground">Submitting your application</p>
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
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="text-center space-y-4 py-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              delay: 0.15,
              type: 'spring',
              stiffness: 200,
              damping: 15,
            }}
            className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto"
          >
            <Check size={20} className="text-emerald-600 dark:text-emerald-400" />
          </motion.div>
          <h2
            className="text-3xl tracking-tight text-foreground"
            style={TITLE_FONT}
          >
            {customization?.thankYouTitle || 'Submitted.'}
          </h2>
          <p className="text-base text-muted-foreground max-w-sm mx-auto">
            {customization?.thankYouMessage ||
              `${businessName} will review your application and follow up shortly.`}
          </p>
          {scoreState?.applicationRef && (
            <a
              href={`/apply/${slug}/status?ref=${scoreState.applicationRef}`}
              className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-foreground/80 transition-colors underline-offset-4 hover:underline"
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

  const currentSection = isOnGettingStarted ? null : sortedSections[sectionIndex];
  const isLastStep = currentStep === totalSteps;

  // Estimated time, weighted by question type. A long-form textarea costs
  // 60s; a radio costs 5s. Honest expectation > friendly lie.
  const visibleQuestions = sortedSections.flatMap((s) =>
    s.questions.filter((q) => isQuestionVisible(q, answers)),
  );
  const estimatedMinutes = estimateMinutes(visibleQuestions);

  const primaryTextColor = pickContrastColor(accentColor);

  return (
    <div
      className={cn(fontClass, customization?.darkMode && 'dark')}
      style={{ '--intake-accent': accentColor } as React.CSSProperties}
    >
      {/* Screen reader announcements for dynamic section changes */}
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {isOnGettingStarted
          ? `Now on step 1 of ${totalSteps}: Getting Started`
          : currentSection && `Now on step ${currentStep} of ${totalSteps}: ${currentSection.title}`}
      </div>

      {/* Video embed — sits above the form card, hairline-separated */}
      {embedUrl && (
        <div
          className={cn('relative w-full overflow-hidden mb-6 border border-border/70', radiusClass)}
          style={{ paddingBottom: '56.25%' }}
        >
          <iframe
            src={embedUrl}
            title="Introduction video"
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      <div className="rounded-xl bg-background border border-border/70 p-6">
        {/* Resume banner (shown when user returns via magic link) */}
        <ResumeBanner
          visible={showResumeBanner}
          onDismiss={() => setShowResumeBanner(false)}
          currentStep={currentStep}
          totalSteps={totalSteps}
          answeredCount={Object.keys(answers).filter((k) => {
            const v = answers[k];
            return v !== '' && v !== undefined && (typeof v !== 'object' || (v as string[]).length > 0);
          }).length}
        />

        {/* Resume error banner (expired/submitted link) */}
        <ResumeErrorBanner
          message={resumeError}
          onDismiss={() => setResumeError('')}
        />

        {/* Stale draft notice */}
        {staleDraft && (
          <div className="flex items-start gap-3 p-3 rounded-md border border-border/70 bg-foreground/[0.025] mb-6">
            <AlertTriangle
              size={14}
              className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">
                The form has been updated since your last visit. Your previous
                answers have been carried over where possible, but you may need
                to review them.
              </p>
              <button
                type="button"
                onClick={dismissStaleNotice}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Time estimate — sets expectations, lifts completion. */}
        <p className="text-xs text-muted-foreground mb-4 text-center">
          About {estimatedMinutes} minute{estimatedMinutes !== 1 ? 's' : ''}.
        </p>

        {/* Stepper + save status — quiet header row */}
        <div className="flex items-center justify-between mb-6">
          <DotStepper current={currentStep} total={totalSteps} />
          <SaveStatusIndicator status={saveStatus} />
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            initial={{ x: direction * 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: direction * -40, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {/* ── Getting Started step (dual-config mode only) ── */}
            {isOnGettingStarted && (
              <section className="space-y-4">
                <StepHeader
                  title="Getting Started"
                  description="Let's personalize your experience."
                />
                {errors['__leadType'] && (
                  <p className="text-xs text-rose-600 dark:text-rose-400">
                    {errors['__leadType']}
                  </p>
                )}
                <LeadTypeSelector
                  question={{
                    id: '__leadType',
                    type: 'radio',
                    label: 'What are you looking for?',
                    required: true,
                    position: 0,
                    options: [
                      { value: 'rental', label: "I'm looking to rent" },
                      { value: 'buyer', label: "I'm looking to buy" },
                    ],
                  }}
                  value={selectedLeadType || ''}
                  onChange={(val) => {
                    const newType = val as 'rental' | 'buyer';
                    if (selectedLeadType && newType !== selectedLeadType) {
                      // User changed lead type — clear previous answers
                      setAnswers({});
                      saveDraft(slug, configVersion, {});
                    }
                    setSelectedLeadType(newType);
                    setErrors({});
                  }}
                  error={errors['__leadType']}
                />
              </section>
            )}

            {/* ── Config-based section content ── */}
            {currentSection && (
              <section className="space-y-4">
                <StepHeader
                  title={currentSection.title}
                  description={currentSection.description}
                />
                <div className="space-y-4">
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
                </div>

                {/* Consent checkbox on the last step */}
                {isLastStep && (
                  <>
                    <div className="border-t border-border/60 my-6" />
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="combined-consent-dynamic"
                        checked={getAnswer('chippiTosConsent') === 'true'}
                        onChange={(e) => {
                          const v = e.target.checked ? 'true' : 'false';
                          setAnswer('chippiTosConsent', v);
                          setAnswer('privacyConsent', v);
                        }}
                        className="mt-0.5 rounded border-border/70 cursor-pointer"
                        required
                      />
                      <label
                        htmlFor="combined-consent-dynamic"
                        className="text-xs text-muted-foreground leading-snug cursor-pointer"
                      >
                        I agree to Chippi&apos;s{' '}
                        <a
                          href="/legal/terms"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                        >
                          Terms of Service
                        </a>{' '}
                        and{' '}
                        <a
                          href="/legal/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground underline underline-offset-2 hover:text-foreground/80"
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
                              className="text-foreground underline underline-offset-2 hover:text-foreground/80"
                            >
                              Privacy Policy
                            </a>
                          </>
                        )}
                      </label>
                    </div>
                    {(errors['chippiTosConsent'] || errors['privacyConsent']) && (
                      <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">
                        {errors['chippiTosConsent'] || errors['privacyConsent']}
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="mt-8">
          {submitError && (
            <p className="text-xs text-rose-600 dark:text-rose-400 mb-3">
              {submitError}
            </p>
          )}
          <div className="flex items-center gap-3">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft size={14} />
                Back
              </button>
            ) : (
              <span />
            )}
            <div className="flex-1" />
            {!isLastStep ? (
              <button
                type="button"
                onClick={goNext}
                className={cn(PRIMARY_PILL)}
                style={{ backgroundColor: accentColor, color: primaryTextColor }}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className={cn(
                  PRIMARY_PILL,
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                )}
                style={{ backgroundColor: accentColor, color: primaryTextColor }}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                {submitting ? 'Submitting' : 'Submit application'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Save notification toast */}
      <SaveNotification message={saveNotification} visible={showSaveNotification} />
    </div>
  );
}
