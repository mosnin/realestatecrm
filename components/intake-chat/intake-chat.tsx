'use client';

/**
 * IntakeChat — the realtor's intake form, presented as a full-screen,
 * one-question-at-a-time flow in the onboarding's vocabulary.
 *
 * The flow, the questions, the customization, the validation, and the
 * submission contract are EXACTLY what the dynamic form did — this is a
 * presentational layer over a deterministic state machine. The form-config
 * drives order; there is no LLM, no streaming, no Modal.
 *
 * What changed in this redesign: instead of a scrolling chat thread inside a
 * small card, the applicant sees one focal question at a time, centered on a
 * full-bleed brand-warm canvas (IntakeChatShell). The active question is the
 * page's hero — a large serif line that types in — with its answer affordance
 * directly beneath it. Answering blur-rises the next question in and the old
 * one away (AnimatePresence step transitions, the onboarding cold-open
 * vocabulary). Progress is shown as expanding dots; a quiet Back affordance
 * lets the applicant revise the previous answer.
 *
 * Endpoints: per-realtor intakes POST to /api/public/apply; brokerage
 * intakes (a `brokerageId` is present) POST to /api/public/apply/brokerage so
 * brokerage auto-assignment, broker notification, and lead tagging run.
 *
 * Validation is sourced from `validateQuestion()` in the form-renderer module
 * so the flow enforces the same rules the form did.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react';
import { validateQuestion } from '@/components/form-renderer/question-renderer';
import { IntakeChatSuccess } from './intake-chat-success';
import { TypingText } from '@/components/onboarding/typing-text';
import { blurRiseStep, INTAKE_EASE } from './intake-motion';
import { cn, formatPhoneAsTyped } from '@/lib/utils';
import {
  DURATION_BASE,
  EASE_OUT,
  STAGGER_CONTAINER,
  STAGGER_ITEM,
} from '@/lib/motion';
import {
  DEFAULT_RENTAL_FORM_CONFIG,
  DEFAULT_BUYER_FORM_CONFIG,
} from '@/lib/form-builder';
import { TITLE_FONT } from '@/lib/typography';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUp,
  Check,
  Loader2,
} from 'lucide-react';
import type { IntakeFormConfig, FormQuestion } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────────────────

type AnswerMap = Record<string, string | string[]>;
type LeadType = 'rental' | 'buyer';
type Phase = 'asking' | 'submitting' | 'done' | 'error';

export interface IntakeChatCustomization {
  accentColor: string;
  thankYouTitle: string | null;
  thankYouMessage: string | null;
  privacyPolicyUrl?: string | null;
}

export interface IntakeChatProps {
  slug: string;
  spaceId: string;
  businessName: string;
  agentName: string;
  agentPhoto?: string | null;
  rentalFormConfig?: IntakeFormConfig | null;
  buyerFormConfig?: IntakeFormConfig | null;
  formConfig?: IntakeFormConfig | null;
  customization: IntakeChatCustomization;
  brokerageId?: string;
}

// ── Synthetic lead-type question (dual-config flows) ─────────────────────────

const LEAD_TYPE_QUESTION_ID = '__leadType__';

const LEAD_TYPE_QUESTION: FormQuestion = {
  id: LEAD_TYPE_QUESTION_ID,
  type: 'radio',
  label: 'Are you looking to rent or buy?',
  required: true,
  position: 0,
  options: [
    { value: 'rental', label: 'Renting' },
    { value: 'buyer', label: 'Buying' },
  ],
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function flattenQuestions(config: IntakeFormConfig | null | undefined): FormQuestion[] {
  if (!config) return [];
  const sections = [...config.sections].sort((a, b) => a.position - b.position);
  return sections.flatMap((s) =>
    [...s.questions].sort((a, b) => a.position - b.position),
  );
}

function evaluateVisibility(
  condition: FormQuestion['visibleWhen'],
  answers: AnswerMap,
): boolean {
  if (!condition) return true;
  const { questionId, operator, value: target } = condition;
  const raw = answers[questionId];
  const str = Array.isArray(raw) ? raw.join(',') : raw ?? '';
  switch (operator) {
    case 'equals':
      return str === target;
    case 'not_equals':
      return str !== target;
    case 'contains':
      return str.includes(target);
    default:
      return true;
  }
}

/**
 * Choose the submission endpoint for an intake.
 *
 * Brokerage intakes (rendered from /apply/b/[brokerageId], which passes a
 * `brokerageId`) MUST hit the dedicated brokerage endpoint so the
 * brokerage-only logic runs: auto-assignment via routeBrokerageLead, the
 * broker dashboard notification, and the 'brokerage-lead' tag. The
 * per-realtor /api/public/apply route keys off `slug` and ignores
 * `brokerageId` entirely, so posting a brokerage intake there silently
 * drops all of that routing.
 */
export function resolveApplyEndpoint(brokerageId?: string | null): string {
  return brokerageId
    ? '/api/public/apply/brokerage'
    : '/api/public/apply';
}

/**
 * Build the /api/public/apply payload. Same shape the dynamic form sent.
 * Keeping the contract identical keeps server-side validation, scoring,
 * and downstream effects (vectorize, notify, trigger fire) behaving the
 * way they do today.
 */
function buildApplicationPayload(args: {
  slug: string;
  spaceId: string;
  brokerageId?: string;
  leadType: LeadType;
  answers: AnswerMap;
  formConfigVersion: number;
  privacyConsent?: boolean;
  visibleQuestionCount: number;
}): Record<string, unknown> {
  const {
    slug,
    spaceId,
    brokerageId,
    leadType,
    answers,
    formConfigVersion,
    privacyConsent,
    visibleQuestionCount,
  } = args;

  const at = (k: string): string | undefined => {
    const v = answers[k];
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  };

  const systemName = at('name') ?? at('legalName') ?? '';
  const systemEmail = at('email') ?? '';
  const systemPhone = at('phone') ?? '';

  return {
    ...answers,
    slug,
    spaceId,
    ...(brokerageId ? { brokerageId } : {}),
    leadType,
    formLeadType: leadType,
    name: systemName,
    legalName: systemName,
    email: systemEmail,
    phone: systemPhone,
    additionalNotes: at('additionalNotes') ?? at('notes'),
    targetMoveInDate: at('targetMoveInDate') ?? at('moveTiming'),
    propertyAddress: at('propertyAddress') ?? at('location'),
    monthlyRent: at('monthlyRent') ?? at('budget'),
    monthlyGrossIncome: at('monthlyGrossIncome') ?? at('income'),
    employmentStatus: at('employmentStatus') ?? at('employment'),
    numberOfOccupants: at('numberOfOccupants') ?? at('occupants'),
    buyerBudget: at('buyerBudget'),
    preApprovalStatus: at('preApprovalStatus'),
    propertyType: at('propertyType'),
    buyerTimeline: at('buyerTimeline'),
    ...(privacyConsent !== undefined ? { privacyConsent } : {}),
    sourceLabel: 'intake-chat',
    formConfigVersion,
    answers,
    completedSteps: Array.from({ length: visibleQuestionCount }, (_, i) => i + 1),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function IntakeChat({
  slug,
  spaceId,
  businessName,
  agentName,
  agentPhoto,
  rentalFormConfig,
  buyerFormConfig,
  formConfig: legacyFormConfig,
  customization,
  brokerageId,
}: IntakeChatProps) {
  // Flow resolution. When no realtor-customized config is supplied, fall
  // back to the library defaults so the flow always has questions to ask
  // (this is what makes the brokerage variant work without configuration).
  const hasAnyConfig =
    Boolean(rentalFormConfig) || Boolean(buyerFormConfig) || Boolean(legacyFormConfig);
  const effectiveRental: IntakeFormConfig | null = hasAnyConfig
    ? rentalFormConfig ?? null
    : DEFAULT_RENTAL_FORM_CONFIG;
  const effectiveBuyer: IntakeFormConfig | null = hasAnyConfig
    ? buyerFormConfig ?? null
    : DEFAULT_BUYER_FORM_CONFIG;

  const hasDual = Boolean(effectiveRental && effectiveBuyer);
  const onlyConfig: IntakeFormConfig | null =
    effectiveRental && !effectiveBuyer
      ? effectiveRental
      : effectiveBuyer && !effectiveRental
        ? effectiveBuyer
        : legacyFormConfig ?? null;

  const initialLeadType: LeadType | null = hasDual
    ? null
    : effectiveRental
      ? 'rental'
      : effectiveBuyer
        ? 'buyer'
        : legacyFormConfig?.leadType === 'buyer'
          ? 'buyer'
          : 'rental';

  // State
  const [leadType, setLeadType] = useState<LeadType | null>(initialLeadType);
  const [answers, setAnswers] = useState<AnswerMap>({});
  // Chronological list of question ids the applicant has answered or skipped.
  // Drives the Back affordance (pop the last one) without re-deriving order
  // from the answers map.
  const [answeredOrder, setAnsweredOrder] = useState<string[]>([]);
  const [pendingValue, setPendingValue] = useState<string | string[]>('');
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('asking');
  const [applicationRef, setApplicationRef] = useState<string | null>(null);
  const [statusPortalToken, setStatusPortalToken] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeConfig = useMemo<IntakeFormConfig | null>(() => {
    if (leadType === 'rental') return effectiveRental ?? onlyConfig;
    if (leadType === 'buyer') return effectiveBuyer ?? onlyConfig;
    return null;
  }, [leadType, effectiveRental, effectiveBuyer, onlyConfig]);

  const questionList = useMemo<FormQuestion[]>(() => {
    const base = flattenQuestions(activeConfig);
    return hasDual ? [LEAD_TYPE_QUESTION, ...base] : base;
  }, [activeConfig, hasDual]);

  const currentQuestion = useMemo<FormQuestion | null>(() => {
    for (const q of questionList) {
      if (answers[q.id] !== undefined) continue;
      if (!evaluateVisibility(q.visibleWhen, answers)) continue;
      return q;
    }
    return null;
  }, [questionList, answers]);

  // Refs
  const askedRef = useRef<Set<string>>(new Set());
  const submitFiredRef = useRef(false);

  // Reset pending input state whenever the active question changes (unless we
  // already primed it — e.g. Back restores the prior value before this fires).
  useEffect(() => {
    if (!currentQuestion) return;
    if (askedRef.current.has(currentQuestion.id)) return;
    askedRef.current.add(currentQuestion.id);
    setPendingValue(currentQuestion.type === 'multi_select' ? [] : '');
    setPendingError(null);
  }, [currentQuestion]);

  // When the question queue empties, submit.
  useEffect(() => {
    if (currentQuestion !== null) return;
    if (phase !== 'asking') return;
    if (Object.keys(answers).length === 0) return;
    if (submitFiredRef.current) return;
    submitFiredRef.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, phase, answers]);

  // Commit a single answer and advance to the next question.
  const commitAnswer = useCallback(
    (question: FormQuestion, value: string | string[]) => {
      const error = validateQuestion(question, value);
      if (error) {
        setPendingError(error);
        return;
      }
      if (question.id === LEAD_TYPE_QUESTION_ID) {
        setLeadType(value as LeadType);
      }
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
      setAnsweredOrder((prev) => [...prev, question.id]);
      setPendingValue('');
      setPendingError(null);
    },
    [],
  );

  // Skip an optional question — record an empty answer and advance.
  const skipOptional = useCallback((question: FormQuestion) => {
    if (question.required) return;
    setAnswers((prev) => ({ ...prev, [question.id]: '' }));
    setAnsweredOrder((prev) => [...prev, question.id]);
    setPendingValue('');
    setPendingError(null);
  }, []);

  // Step back to the previous question, restoring its prior answer as the
  // pending value so the applicant sees what they entered and can adjust it.
  const goBack = useCallback(() => {
    if (answeredOrder.length === 0) return;
    const lastId = answeredOrder[answeredOrder.length - 1];
    const prior = answers[lastId];

    setAnsweredOrder((o) => o.slice(0, -1));
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[lastId];
      return next;
    });
    if (lastId === LEAD_TYPE_QUESTION_ID) setLeadType(null);

    // Mark as already-asked so the reset effect leaves our restored value
    // alone; then restore what they had.
    askedRef.current.add(lastId);
    setPendingValue(prior ?? '');
    setPendingError(null);
    submitFiredRef.current = false;
    if (phase !== 'asking') setPhase('asking');
  }, [answeredOrder, answers, phase]);

  async function submit() {
    if (!activeConfig || !leadType) {
      setSubmitError('Form configuration is missing. Please refresh and try again.');
      setPhase('error');
      submitFiredRef.current = false;
      return;
    }
    setPhase('submitting');

    const consentRaw = answers['privacyConsent'];
    const privacyConsent =
      typeof consentRaw === 'string' ? consentRaw === 'true' : undefined;

    const visibleQuestionCount = questionList.filter((q) =>
      evaluateVisibility(q.visibleWhen, answers),
    ).length;

    const payload = buildApplicationPayload({
      slug,
      spaceId,
      brokerageId,
      leadType,
      answers,
      formConfigVersion: activeConfig.version,
      privacyConsent,
      visibleQuestionCount,
    });

    const endpoint = resolveApplyEndpoint(brokerageId);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error || "We couldn't submit your application. Try again?");
        setPhase('error');
        submitFiredRef.current = false;
        return;
      }
      const data = (await res.json()) as {
        applicationRef?: string;
        statusPortalToken?: string;
      };
      setApplicationRef(data.applicationRef ?? null);
      setStatusPortalToken(data.statusPortalToken ?? null);
      setPhase('done');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setPhase('error');
      submitFiredRef.current = false;
    }
  }

  // Progress: count of visible questions vs how many have been answered.
  //
  // Dual-config wrinkle: while the lead-type question is unanswered the
  // questionList is just `[LEAD_TYPE_QUESTION]`. Project an honest upper
  // bound from the larger of the two configs so the applicant doesn't see
  // "1 of 1" and then keep going.
  const liveTotal = questionList.filter((q) =>
    evaluateVisibility(q.visibleWhen, answers),
  ).length;
  const projectedDualTotal =
    hasDual && leadType === null
      ? 1 + Math.max(
          flattenQuestions(effectiveRental).length,
          flattenQuestions(effectiveBuyer).length,
        )
      : 0;
  const totalQuestions = Math.max(liveTotal, projectedDualTotal);
  const answeredCount = answeredOrder.length;
  const showProgress =
    phase === 'asking' && totalQuestions > 0 && answeredCount < totalQuestions;
  const canGoBack = phase === 'asking' && answeredOrder.length > 0;

  // The applicant's first name (for the success headline), parsed from the
  // name answer they gave.
  const nameAnswer = answers['name'];
  const fullName = typeof nameAnswer === 'string' ? nameAnswer.trim() : '';
  const firstName = fullName.split(/\s+/)[0] || '';

  const statusHref = applicationRef
    ? statusPortalToken
      ? `/apply/${slug}/status?ref=${encodeURIComponent(applicationRef)}&token=${encodeURIComponent(statusPortalToken)}`
      : `/apply/${slug}/status?ref=${encodeURIComponent(applicationRef)}`
    : null;

  const reduce = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      {/* Back — quiet ghost affordance, top-left of the viewport. Only when
          there's somewhere to go back to and we're still asking. */}
      <AnimatePresence>
        {canGoBack && (
          <motion.button
            type="button"
            onClick={goBack}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed left-4 top-4 z-30 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground/80 transition-colors hover:bg-foreground/[0.04] hover:text-foreground sm:left-6 sm:top-6"
          >
            <ArrowLeft size={15} aria-hidden />
            Back
          </motion.button>
        )}
      </AnimatePresence>

      {/* Progress dots — onboarding vocabulary, centered above the question. */}
      {showProgress && (
        <div className="mb-8 flex justify-center">
          <ProgressDots
            answered={answeredCount}
            total={totalQuestions}
            accentColor={customization.accentColor}
          />
        </div>
      )}

      {/* The one focal stage — question, submitting, error, or success. Each
          blur-rises in as the previous blurs away (AnimatePresence wait). */}
      <div className="relative">
        <AnimatePresence mode="wait" initial={false}>
          {phase === 'done' ? (
            <motion.div
              key="done"
              {...blurRiseStep(reduce)}
              transition={{ duration: 0.6, ease: INTAKE_EASE }}
            >
              <IntakeChatSuccess
                businessName={businessName}
                firstName={firstName}
                realtorName={agentName}
                agentPhoto={agentPhoto}
                applicationRef={applicationRef}
                thankYouTitle={customization.thankYouTitle}
                thankYouMessage={customization.thankYouMessage}
                accentColor={customization.accentColor}
                bookHref={`/book/${slug}`}
                statusHref={statusHref}
                profileHref={`/p/${slug}`}
              />
            </motion.div>
          ) : phase === 'submitting' ? (
            <motion.div
              key="submitting"
              {...blurRiseStep(reduce)}
              transition={{ duration: 0.45, ease: INTAKE_EASE }}
            >
              <SubmittingStage accentColor={customization.accentColor} />
            </motion.div>
          ) : phase === 'error' && submitError ? (
            <motion.div
              key="error"
              {...blurRiseStep(reduce)}
              transition={{ duration: 0.45, ease: INTAKE_EASE }}
            >
              <ErrorStage
                message={submitError}
                accentColor={customization.accentColor}
                onRetry={() => {
                  setSubmitError(null);
                  void submit();
                }}
              />
            </motion.div>
          ) : currentQuestion ? (
            <motion.div
              key={currentQuestion.id}
              {...blurRiseStep(reduce)}
              transition={{ duration: 0.5, ease: INTAKE_EASE }}
            >
              <CurrentQuestion
                question={currentQuestion}
                value={pendingValue}
                isFirst={answeredCount === 0}
                agentName={agentName}
                onChange={(v) => {
                  setPendingValue(v);
                  if (pendingError) setPendingError(null);
                }}
                onCommit={(v) => commitAnswer(currentQuestion, v)}
                onSkip={() => skipOptional(currentQuestion)}
                error={pendingError}
                accentColor={customization.accentColor}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

// Alias preserved so existing imports don't break.
export { IntakeChat as IntakeChatView };

// ─── Progress ────────────────────────────────────────────────────────────────

/**
 * Expanding-dot progress, the onboarding vocabulary: completed steps are
 * small filled dots in the realtor's accent, the active step is a wide pill,
 * the rest are faint. The accessible fraction is announced via aria.
 */
function ProgressDots({
  answered,
  total,
  accentColor,
}: {
  answered: number;
  total: number;
  accentColor: string;
}) {
  // Clamp the visible dot count; past ~14 the eye reads them as a band, not
  // a count, so we proportionally map progress onto the clamped scale.
  const count = Math.min(total, 14);
  const active = Math.min(Math.round((answered / Math.max(total, 1)) * count), count);
  return (
    <div
      role="progressbar"
      aria-valuenow={answered}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuetext={`Question ${Math.min(answered + 1, total)} of ${total}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: count }).map((_, i) => {
        const done = i < active;
        const isActive = i === active;
        return (
          <motion.span
            key={i}
            aria-hidden
            className={cn('inline-block h-1.5 rounded-full', !done && !isActive && 'bg-foreground/15')}
            style={done || isActive ? { backgroundColor: done ? withAlpha(accentColor, 0.45) : accentColor } : undefined}
            animate={{ width: isActive ? 26 : 6 }}
            transition={{ duration: 0.3, ease: INTAKE_EASE }}
          />
        );
      })}
    </div>
  );
}

// ─── Current-question renderer ───────────────────────────────────────────────

interface CurrentQuestionProps {
  question: FormQuestion;
  value: string | string[];
  isFirst: boolean;
  agentName: string;
  onChange: (v: string | string[]) => void;
  onCommit: (v: string | string[]) => void;
  onSkip: () => void;
  error: string | null;
  accentColor: string;
}

function CurrentQuestion({
  question,
  value,
  isFirst,
  agentName,
  onChange,
  onCommit,
  onSkip,
  error,
  accentColor,
}: CurrentQuestionProps) {
  // The active question is the page's one focal element: a large serif line,
  // centered, that types in (mirroring the onboarding focal line). The answer
  // affordance fades up a beat after the question finishes typing so the eye
  // reads the question first. `typedDone` only gates the reveal animation — it
  // never touches answer handling.
  const reduce = useReducedMotion();
  const [typedDone, setTypedDone] = useState(false);

  useEffect(() => {
    setTypedDone(false);
  }, [question.id]);

  const affordanceReady = reduce ? true : typedDone;

  return (
    <div className="flex flex-col items-center text-center" aria-live="polite">
      {/* A single quiet greeting line above the very first question — names
          Chippi and the realtor in one breath, then gets out of the way. */}
      {isFirst && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="mb-4 text-[13px] text-muted-foreground"
        >
          Hi — I&rsquo;m Chippi, with {agentName}. A few quick questions.
        </motion.p>
      )}

      <h2
        className="text-3xl leading-tight tracking-tight text-foreground sm:text-4xl"
        style={TITLE_FONT}
      >
        <TypingText
          text={question.label}
          charsPerSecond={52}
          startDelayMs={120}
          onDone={() => setTypedDone(true)}
        />
      </h2>

      {question.description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: affordanceReady ? 1 : 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground"
        >
          {question.description}
        </motion.p>
      )}

      {/* Answer affordance — fades + rises a beat after the question types in.
          Stays mounted throughout (only opacity/translate animate) so input
          refs/focus are never torn down. */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={affordanceReady ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className={cn(
          'mt-9 w-full',
          !affordanceReady && 'pointer-events-none',
        )}
      >
        {renderInputForQuestion({
          question,
          value,
          onChange,
          onCommit,
          accentColor,
          error,
        })}
        {error && (
          <p className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>
        )}
        {!question.required && question.type !== 'checkbox' && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              Skip this
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

interface InputProps {
  question: FormQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  onCommit: (v: string | string[]) => void;
  accentColor: string;
  error: string | null;
}

function renderInputForQuestion(props: InputProps) {
  const { question } = props;
  if (question.type === 'select' || question.type === 'radio') {
    return <ChoiceCards {...props} />;
  }
  if (question.type === 'multi_select') {
    return <ChoiceChips {...props} />;
  }
  if (question.type === 'checkbox') {
    return <YesNoChoice {...props} />;
  }
  if (question.type === 'date') {
    return <DateField {...props} />;
  }
  return <ChatComposer {...props} />;
}

// ─── Widgets — centered, content-fit, no form chrome ─────────────────────────

function ChoiceCards({ question, onCommit, accentColor }: InputProps) {
  const options = question.options ?? [];
  // Short labels → a centered wrapping row of pills; long/many → a centered
  // stack of full-width cards.
  const longest = options.reduce((m, o) => Math.max(m, o.label.length), 0);
  const stack = options.length > 4 || longest > 28;

  // Selected-state flash on tap, holding ~180ms before committing — the
  // visual confirmation chat UIs train people to expect.
  const [pending, setPending] = useState<string | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  const handleTap = (value: string) => {
    if (pending) return;
    setPending(value);
    commitTimer.current = setTimeout(() => onCommit(value), 180);
  };

  return (
    <motion.div
      variants={STAGGER_CONTAINER}
      initial="initial"
      animate="enter"
      className={cn(
        'mx-auto',
        stack
          ? 'flex w-full max-w-sm flex-col gap-2.5'
          : 'flex max-w-md flex-wrap justify-center gap-3',
      )}
    >
      {options.map((option) => {
        const isPending = pending === option.value;
        const otherPending = pending !== null && !isPending;
        return (
          <motion.button
            key={option.value}
            variants={STAGGER_ITEM}
            type="button"
            onClick={() => handleTap(option.value)}
            disabled={otherPending}
            className={cn(
              'group relative inline-flex items-center justify-center gap-2',
              'rounded-2xl border bg-card/80 backdrop-blur-sm',
              'px-6 py-4 text-base font-medium text-foreground',
              'transition-all duration-150 active:scale-[0.98]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isPending
                ? 'border-transparent text-white shadow-md'
                : 'border-border/70 hover:-translate-y-0.5 hover:border-border hover:shadow-sm',
              otherPending && 'cursor-not-allowed opacity-40',
              stack ? 'w-full text-left justify-start' : 'min-w-[150px]',
            )}
            style={
              isPending
                ? { backgroundColor: accentColor }
                : ({ ['--tw-ring-color' as never]: accentColor } as React.CSSProperties)
            }
            aria-pressed={isPending}
          >
            {isPending && <Check size={16} aria-hidden />}
            {option.label}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

function ChoiceChips({ question, value, onChange, onCommit, accentColor }: InputProps) {
  const options = question.options ?? [];
  const selected = Array.isArray(value)
    ? value
    : typeof value === 'string' && value
      ? value.split(',').filter(Boolean)
      : [];

  const toggle = (v: string) => {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onChange(next);
  };

  const isEmpty = selected.length === 0;

  return (
    <div className="mx-auto w-full max-w-md space-y-5">
      <motion.div
        variants={STAGGER_CONTAINER}
        initial="initial"
        animate="enter"
        className="flex flex-wrap justify-center gap-2.5"
      >
        {options.map((option) => {
          const isOn = selected.includes(option.value);
          return (
            <motion.button
              key={option.value}
              variants={STAGGER_ITEM}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium',
                'transition-all duration-150 active:scale-[0.97]',
                isOn
                  ? 'border-transparent text-white'
                  : 'border-border/70 text-foreground hover:bg-muted/40',
              )}
              style={isOn ? { backgroundColor: accentColor, borderColor: accentColor } : undefined}
            >
              {isOn && <Check size={13} aria-hidden />}
              {option.label}
            </motion.button>
          );
        })}
      </motion.div>
      <div className="flex justify-center">
        <PrimaryActionButton
          accentColor={accentColor}
          disabled={isEmpty && question.required}
          onClick={() => onCommit(selected)}
        >
          {isEmpty ? 'Skip' : 'Continue'}
        </PrimaryActionButton>
      </div>
    </div>
  );
}

function YesNoChoice({ onCommit, accentColor }: InputProps) {
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {[
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onCommit(option.value)}
          className={cn(
            'rounded-2xl border border-border/70 bg-card/80 backdrop-blur-sm hover:-translate-y-0.5 hover:border-border hover:shadow-sm',
            'min-w-[130px] px-7 py-4 text-base font-medium text-foreground',
            'transition-all duration-150 active:scale-[0.98]',
            'focus-visible:outline-none focus-visible:ring-2',
          )}
          style={{ ['--tw-ring-color' as never]: accentColor } as React.CSSProperties}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DateField({ value, onChange, onCommit, accentColor, error }: InputProps) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div className="mx-auto flex max-w-sm items-stretch gap-2">
      <input
        type="date"
        value={v}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-12 flex-1 rounded-2xl border bg-background px-4 text-[15px]',
          'transition-colors duration-150',
          error
            ? 'border-rose-500/60'
            : 'border-border/70 focus:border-foreground/40 focus:outline-none',
        )}
      />
      <PrimaryActionButton accentColor={accentColor} disabled={!v} onClick={() => onCommit(v)}>
        Continue
      </PrimaryActionButton>
    </div>
  );
}

const EMAIL_INLINE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ChatComposer({ question, value, onChange, onCommit, accentColor, error }: InputProps) {
  // A single rounded composer — input + circular send. Centered, comfortable.
  const v = typeof value === 'string' ? value : '';
  const isTextarea = question.type === 'textarea';
  const inputType =
    question.type === 'email'
      ? 'email'
      : question.type === 'phone'
        ? 'tel'
        : question.type === 'number'
          ? 'number'
          : 'text';
  const inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode'] =
    question.type === 'email'
      ? 'email'
      : question.type === 'phone'
        ? 'tel'
        : question.type === 'number'
          ? 'numeric'
          : 'text';

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [inlineEmailError, setInlineEmailError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [question.id]);

  useEffect(() => {
    if (question.type !== 'email') {
      if (inlineEmailError) setInlineEmailError(null);
      return;
    }
    const trimmed = v.trim();
    if (trimmed.length === 0 || !trimmed.includes('@')) {
      if (inlineEmailError) setInlineEmailError(null);
      return;
    }
    const t = setTimeout(() => {
      setInlineEmailError(
        EMAIL_INLINE_RE.test(trimmed) ? null : "Doesn't look like a valid email yet.",
      );
    }, 450);
    return () => clearTimeout(t);
  }, [v, question.type, inlineEmailError]);

  const handleTextChange = (next: string) => {
    if (question.type === 'phone') {
      onChange(formatPhoneAsTyped(next));
      return;
    }
    onChange(next);
  };

  const onKeyDown = (
    e: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    if (isTextarea) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (v.trim() || !question.required) onCommit(v);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (v.trim() || !question.required) onCommit(v);
    }
  };

  const empty = v.trim().length === 0;
  const sendDisabled = question.required ? empty : false;
  const showInlineError = !error && inlineEmailError !== null;

  return (
    <div className="mx-auto w-full max-w-md space-y-1.5">
      <div
        className={cn(
          'flex items-end gap-2 rounded-[26px] border bg-background/80 py-2 pl-5 pr-2.5 backdrop-blur-sm',
          'shadow-sm transition-colors duration-150',
          error || showInlineError
            ? 'border-rose-500/60'
            : 'border-border/70 focus-within:border-foreground/40',
        )}
      >
        {isTextarea ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={v}
            onChange={(e) => {
              handleTextChange(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 200)}px`;
            }}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={question.placeholder ?? 'Type your answer…'}
            className="max-h-[200px] flex-1 resize-none bg-transparent py-2 text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/50"
            aria-invalid={Boolean(error || showInlineError)}
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={inputType}
            inputMode={inputMode}
            value={v}
            onChange={(e) => handleTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={question.placeholder ?? defaultPlaceholderFor(question.type)}
            className="flex-1 bg-transparent py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
            autoComplete={
              question.type === 'email'
                ? 'email'
                : question.type === 'phone'
                  ? 'tel-national'
                  : undefined
            }
            aria-invalid={Boolean(error || showInlineError)}
          />
        )}
        <button
          type="button"
          onClick={() => (sendDisabled ? undefined : onCommit(v))}
          disabled={sendDisabled}
          aria-label="Send answer"
          className={cn(
            'mb-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center self-end rounded-full',
            'transition-all duration-150 active:scale-[0.94]',
            sendDisabled
              ? 'cursor-not-allowed bg-foreground/15 text-foreground/40'
              : 'text-white shadow-sm',
          )}
          style={sendDisabled ? undefined : { backgroundColor: accentColor }}
        >
          <ArrowUp size={17} />
        </button>
      </div>
      {showInlineError && (
        <p className="px-2 text-xs text-rose-600 dark:text-rose-400" role="status">
          {inlineEmailError}
        </p>
      )}
    </div>
  );
}

function defaultPlaceholderFor(type: FormQuestion['type']): string {
  switch (type) {
    case 'email':
      return 'you@example.com';
    case 'phone':
      return '(555) 123-4567';
    case 'number':
      return 'Enter a number';
    default:
      return 'Type your answer…';
  }
}

function PrimaryActionButton({
  accentColor,
  disabled,
  onClick,
  children,
}: {
  accentColor: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-7 text-sm font-semibold',
        'transition-all duration-150 active:scale-[0.97]',
        disabled
          ? 'cursor-not-allowed bg-foreground/15 text-foreground/40'
          : 'text-white shadow-sm',
      )}
      style={disabled ? undefined : { backgroundColor: accentColor }}
    >
      {children}
    </button>
  );
}

// ─── Color helper ────────────────────────────────────────────────────────────

/**
 * Add an alpha channel to a hex/rgb color string. Returns the input
 * untouched on unknown formats so a malformed accent color never crashes.
 */
function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (color.startsWith('rgb')) {
    const nums = color.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${a})`;
    }
  }
  return color;
}

// ─── Submitting / Error stages ───────────────────────────────────────────────

function SubmittingStage({ accentColor }: { accentColor: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: accentColor }} />
      <p
        className="mt-5 text-2xl tracking-tight text-foreground sm:text-3xl"
        style={TITLE_FONT}
      >
        Sending your answers.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">One moment.</p>
    </div>
  );
}

function ErrorStage({
  message,
  accentColor,
  onRetry,
}: {
  message: string;
  accentColor: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center" role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10">
        <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
      </div>
      <p
        className="mt-5 text-2xl tracking-tight text-foreground sm:text-3xl"
        style={TITLE_FONT}
      >
        That didn&rsquo;t go through.
      </p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-full px-7 text-sm font-semibold text-white shadow-sm transition-transform duration-150 active:scale-[0.97]"
        style={{ backgroundColor: accentColor }}
      >
        Try again
      </button>
    </div>
  );
}
