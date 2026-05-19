'use client';

/**
 * IntakeChat — the realtor's intake form rendered as a chat.
 *
 * The flow, the questions, the customization, the validation, and the
 * submission contract are exactly what the dynamic form did. Only the
 * presentation changed: each question becomes a Chippi turn in a chat
 * thread, and the matching input widget appears inline below it. Tap to
 * submit on choice questions; type+continue for free-text. When the
 * question list is exhausted (respecting `visibleWhen`), we POST to
 * /api/public/apply with the same payload shape the dynamic form sent.
 *
 * What this is NOT:
 *   - It is NOT an LLM-driven interview. The form-config drives order.
 *     We do not stream from an LLM, we do not emit __FIELDS__ markers,
 *     we do not call Modal. The "chat with an AI agent" feel is a
 *     presentational layer over a deterministic state machine.
 *   - It is NOT a redesign of the form-builder or the customization
 *     surface. Realtors edit their questions in the existing form
 *     builder; the chat presents them.
 *
 * Inputs are sourced from <QuestionRenderer> (which renders every
 * IntakeFormConfig question type already, with all validation rules
 * baked in). The chat layer hides the renderer's redundant label/
 * description (they're carried by the assistant message itself) and
 * wraps each turn in chat-shaped chrome.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  QuestionRenderer,
  validateQuestion,
} from '@/components/form-renderer/question-renderer';
import {
  DEFAULT_RENTAL_FORM_CONFIG,
  DEFAULT_BUYER_FORM_CONFIG,
} from '@/lib/form-builder';
import { MessageBubble } from './message-bubble';
import { IntakeChatSuccess } from './intake-chat-success';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import type { IntakeFormConfig, FormQuestion } from '@/lib/types';

// ── Types ────────────────────────────────────────────────────────────────────

type AnswerMap = Record<string, string | string[]>;
type LeadType = 'rental' | 'buyer';
type Phase = 'asking' | 'submitting' | 'done' | 'error';

interface ChatTurn {
  /** UI-stable key so React doesn't remount on every state change. */
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

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
  /** Realtor's rental form config, if configured. */
  rentalFormConfig?: IntakeFormConfig | null;
  /** Realtor's buyer form config, if configured. */
  buyerFormConfig?: IntakeFormConfig | null;
  /** Legacy single-config fallback for spaces that haven't migrated. */
  formConfig?: IntakeFormConfig | null;
  customization: IntakeChatCustomization;
  /** Brokerage routing pass-through (kept for parity with the form). */
  brokerageId?: string;
}

// ── Synthetic lead-type question ─────────────────────────────────────────────
//
// When the realtor has BOTH a rental and a buyer config, we start the
// chat by asking which one applies — same behaviour as the form's
// Getting Started step. Built as a synthetic `radio` so the renderer
// path is identical to every other question.

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

/** Flatten sections → ordered question list, respecting `position`. */
function flattenQuestions(config: IntakeFormConfig | null | undefined): FormQuestion[] {
  if (!config) return [];
  const sections = [...config.sections].sort((a, b) => a.position - b.position);
  return sections.flatMap((s) =>
    [...s.questions].sort((a, b) => a.position - b.position),
  );
}

/**
 * Mirrors the form's `evaluateVisibility` so the chat respects every
 * conditional question the realtor configured. Kept in-file (not
 * imported from the form) because the form module is being deleted.
 */
function evaluateVisibility(
  condition: FormQuestion['visibleWhen'],
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

/**
 * Turn an answer value into the natural-language string the user bubble
 * displays. For options-typed questions, prefer the option label over
 * the option value ("Renting" not "rental"). For checkbox booleans,
 * "Yes"/"No". For arrays, comma-join.
 */
function formatAnswerText(question: FormQuestion, value: string | string[]): string {
  if (Array.isArray(value)) {
    const labels = value.map(
      (v) => question.options?.find((o) => o.value === v)?.label ?? v,
    );
    return labels.join(', ');
  }
  if (question.type === 'checkbox') {
    return value === 'true' ? 'Yes' : 'No';
  }
  const option = question.options?.find((o) => o.value === value);
  if (option) return option.label;
  return value;
}

/** Tap-to-submit types — selecting an option IS the answer. */
function isTapToSubmit(type: FormQuestion['type']): boolean {
  return type === 'select' || type === 'radio';
}

/**
 * Build the /api/public/apply payload. Same shape the dynamic form
 * sends — keeps the submission contract identical, so server-side
 * validation, scoring, and downstream effects (vectorize, notify,
 * trigger fire) all behave the way they do today.
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
  const { slug, spaceId, brokerageId, leadType, answers, formConfigVersion, privacyConsent, visibleQuestionCount } = args;

  const stringAt = (k: string): string | undefined => {
    const v = answers[k];
    if (typeof v === 'string' && v.length > 0) return v;
    return undefined;
  };

  const systemName = stringAt('name') ?? stringAt('legalName') ?? '';
  const systemEmail = stringAt('email') ?? '';
  const systemPhone = stringAt('phone') ?? '';

  return {
    ...answers,
    slug,
    spaceId,
    ...(brokerageId ? { brokerageId } : {}),
    leadType,
    formLeadType: leadType,
    // System fields the dynamic Zod schema expects at top-level.
    name: systemName,
    legalName: systemName,
    email: systemEmail,
    phone: systemPhone,
    // Mapped legacy fields — same fallbacks the form sent.
    additionalNotes: stringAt('additionalNotes') ?? stringAt('notes'),
    targetMoveInDate: stringAt('targetMoveInDate') ?? stringAt('moveTiming'),
    propertyAddress: stringAt('propertyAddress') ?? stringAt('location'),
    monthlyRent: stringAt('monthlyRent') ?? stringAt('budget'),
    monthlyGrossIncome: stringAt('monthlyGrossIncome') ?? stringAt('income'),
    employmentStatus: stringAt('employmentStatus') ?? stringAt('employment'),
    numberOfOccupants: stringAt('numberOfOccupants') ?? stringAt('occupants'),
    buyerBudget: stringAt('buyerBudget'),
    preApprovalStatus: stringAt('preApprovalStatus'),
    propertyType: stringAt('propertyType'),
    buyerTimeline: stringAt('buyerTimeline'),
    // Consent flows through if a privacy policy was configured.
    ...(privacyConsent !== undefined ? { privacyConsent } : {}),
    // Mark this submission as chat-sourced so realtors can tell apart.
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
  // ── Flow resolution ──────────────────────────────────────────────────────
  // Four shapes the realtor's setup can be in:
  //   1. Both rentalFormConfig and buyerFormConfig — ask leadType first.
  //   2. Just one of them — go straight in.
  //   3. Legacy `formConfig` (pre-split) — treat per its declared leadType.
  //   4. No configs at all (uncustomized space, or the brokerage variant
  //      before brokerage form configs are wired) — fall back to the
  //      default rental + buyer configs from lib/form-builder so the
  //      lead always sees questions, never an empty chat.
  const hasAnyConfig =
    Boolean(rentalFormConfig) ||
    Boolean(buyerFormConfig) ||
    Boolean(legacyFormConfig);

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

  // ── State ────────────────────────────────────────────────────────────────
  const [leadType, setLeadType] = useState<LeadType | null>(initialLeadType);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [pendingValue, setPendingValue] = useState<string | string[]>('');
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('asking');
  const [applicationRef, setApplicationRef] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Question list resolution ─────────────────────────────────────────────
  // Order: (optional lead-type question) → flat list of the chosen config.
  // Recomputed whenever leadType resolves so the right config drives the
  // rest of the run.
  const activeConfig = useMemo<IntakeFormConfig | null>(() => {
    if (leadType === 'rental') return effectiveRental ?? onlyConfig;
    if (leadType === 'buyer') return effectiveBuyer ?? onlyConfig;
    return null;
  }, [leadType, effectiveRental, effectiveBuyer, onlyConfig]);

  const questionList = useMemo<FormQuestion[]>(() => {
    const base = flattenQuestions(activeConfig);
    if (hasDual) return [LEAD_TYPE_QUESTION, ...base];
    return base;
  }, [activeConfig, hasDual]);

  // The next unanswered, currently-visible question.
  const currentQuestion = useMemo<FormQuestion | null>(() => {
    for (const q of questionList) {
      if (answers[q.id] !== undefined) continue;
      if (!evaluateVisibility(q.visibleWhen, answers)) continue;
      return q;
    }
    return null;
  }, [questionList, answers]);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const bottomRef = useRef<HTMLDivElement>(null);
  // Tracks which question.id we've already enqueued an assistant turn for,
  // so re-renders don't double-append.
  const askedRef = useRef<Set<string>>(new Set());
  // Guard against double-submit when currentQuestion becomes null.
  const submitFiredRef = useRef(false);

  // ── Greeting + initial scroll ────────────────────────────────────────────
  useEffect(() => {
    if (turns.length > 0) return;
    const opener = `Hi, I'm ${agentName || businessName}. A few quick questions.`;
    setTurns([{ id: 'greeting', role: 'assistant', text: opener }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Append an assistant turn each time we advance to a new question.
  useEffect(() => {
    if (!currentQuestion) return;
    if (askedRef.current.has(currentQuestion.id)) return;
    askedRef.current.add(currentQuestion.id);
    setTurns((prev) => [
      ...prev,
      { id: `ask:${currentQuestion.id}`, role: 'assistant', text: currentQuestion.label },
    ]);
    setPendingValue(currentQuestion.type === 'multi_select' ? [] : '');
    setPendingError(null);
  }, [currentQuestion]);

  // When question list is exhausted (and the user has answered at least
  // one thing), fire the submission.
  useEffect(() => {
    if (currentQuestion !== null) return;
    if (phase !== 'asking') return;
    if (Object.keys(answers).length === 0) return;
    if (submitFiredRef.current) return;
    submitFiredRef.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion, phase, answers]);

  // Auto-scroll the chat to the bottom on every meaningful change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, currentQuestion, phase]);

  // ── Submit a single answer ───────────────────────────────────────────────
  const commitAnswer = useCallback(
    (question: FormQuestion, value: string | string[]) => {
      const error = validateQuestion(question, value);
      if (error) {
        setPendingError(error);
        return;
      }
      // Lead-type pre-question: drives the rest of the flow.
      if (question.id === LEAD_TYPE_QUESTION_ID) {
        setLeadType(value as LeadType);
      }
      // Append the user bubble + record the answer. Reset the pending
      // input state so the next question lands clean.
      const text = formatAnswerText(question, value);
      setTurns((prev) => [
        ...prev,
        { id: `ans:${question.id}`, role: 'user', text },
      ]);
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
      setPendingValue('');
      setPendingError(null);
    },
    [],
  );

  // Skip an optional question by recording an empty value (so it doesn't
  // get re-asked) but never bubbling a user message — the chat skips
  // over silently, which feels right for "rather not answer".
  const skipOptional = useCallback((question: FormQuestion) => {
    if (question.required) return;
    setAnswers((prev) => ({ ...prev, [question.id]: '' }));
    setPendingValue('');
    setPendingError(null);
  }, []);

  // ── Final submission ─────────────────────────────────────────────────────
  async function submit() {
    if (!activeConfig || !leadType) {
      setSubmitError('Form configuration is missing. Please refresh and try again.');
      setPhase('error');
      submitFiredRef.current = false;
      return;
    }
    setPhase('submitting');

    // Privacy consent: if the config has a question with id 'privacyConsent'
    // we map its boolean to the field the server expects.
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

    try {
      const res = await fetch('/api/public/apply', {
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
      const data = (await res.json()) as { applicationRef?: string };
      setApplicationRef(data.applicationRef ?? null);
      setPhase('done');
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
      setPhase('error');
      submitFiredRef.current = false;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="space-y-6">
          {turns.map((turn) => (
            <MessageBubble
              key={turn.id}
              role={turn.role}
              content={turn.text}
              agentPhoto={agentPhoto}
              agentName={agentName}
              accentColor={customization.accentColor}
            />
          ))}

          {phase === 'asking' && currentQuestion && (
            <CurrentQuestionInput
              key={currentQuestion.id}
              question={currentQuestion}
              value={pendingValue}
              onChange={(v) => {
                setPendingValue(v);
                if (pendingError) setPendingError(null);
              }}
              onSubmit={() => commitAnswer(currentQuestion, pendingValue)}
              onTapOption={(v) => commitAnswer(currentQuestion, v)}
              onSkip={() => skipOptional(currentQuestion)}
              error={pendingError}
              accentColor={customization.accentColor}
            />
          )}

          {phase === 'submitting' && (
            <SubmittingTurn
              agentPhoto={agentPhoto}
              agentName={agentName}
              accentColor={customization.accentColor}
            />
          )}

          {phase === 'error' && submitError && (
            <ErrorTurn
              message={submitError}
              onRetry={() => {
                setSubmitError(null);
                void submit();
              }}
              accentColor={customization.accentColor}
            />
          )}

          {phase === 'done' && (
            <IntakeChatSuccess
              businessName={businessName}
              agentPhoto={agentPhoto}
              applicationRef={applicationRef}
              thankYouTitle={customization.thankYouTitle}
              thankYouMessage={customization.thankYouMessage}
              accentColor={customization.accentColor}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ── Current-question slot ────────────────────────────────────────────────────
// Renders the live question's input controls indented under the assistant's
// last message. Tap-to-submit for radio/select; type+continue for everything
// else. Optional questions get a Skip affordance.

interface CurrentQuestionInputProps {
  question: FormQuestion;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  onSubmit: () => void;
  onTapOption: (v: string) => void;
  onSkip: () => void;
  error: string | null;
  accentColor: string;
}

function CurrentQuestionInput({
  question,
  value,
  onChange,
  onSubmit,
  onTapOption,
  onSkip,
  error,
  accentColor,
}: CurrentQuestionInputProps) {
  const tapMode = isTapToSubmit(question.type);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Autofocus the first text-shaped input when each new question appears.
  // Saves the lead a tap; matches how the original form auto-focused on
  // step transitions. No-op for tap-mode questions (no input to focus).
  useEffect(() => {
    if (tapMode) return;
    if (!wrapperRef.current) return;
    const target = wrapperRef.current.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([type=checkbox]), textarea',
    );
    target?.focus();
  }, [question.id, tapMode]);

  // For tap-mode question types, we wrap onChange so the user's selection
  // immediately commits the answer. For everything else, onChange just
  // updates pendingValue and a Continue button fires the submit.
  const renderValue = value;
  const handleRendererChange = (next: string | string[]) => {
    if (tapMode && typeof next === 'string') {
      onTapOption(next);
      return;
    }
    onChange(next);
  };

  // For type+continue inputs, Enter submits (text) / Cmd+Enter (textarea).
  // Implemented at the wrapper level so the renderer stays generic.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (tapMode) return;
    if (question.type === 'textarea') {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSubmit();
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit();
    }
  };

  const isEmpty =
    (typeof value === 'string' && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0);

  return (
    <motion.div
      ref={wrapperRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="pl-8 sm:pl-9 pr-1 max-w-[640px]"
      onKeyDown={onKeyDown}
    >
      <QuestionRenderer
        question={question}
        value={renderValue}
        onChange={handleRendererChange}
        error={error ?? undefined}
        hideLabel
        hideDescription
      />

      {/* Per-question description sits as a muted line — Chippi's voice
          carries the question, the description is a soft footnote. */}
      {question.description && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {question.description}
        </p>
      )}

      {/* Continue / Skip / Error row. Only rendered when we need it —
          tap-mode questions submit on tap, so they don't get a button. */}
      {!tapMode && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {!question.required ? (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={onSubmit}
            disabled={question.required && isEmpty}
            className="rounded-full px-4 h-9 gap-1.5"
            style={
              !(question.required && isEmpty)
                ? { backgroundColor: accentColor, color: '#fff' }
                : undefined
            }
          >
            Continue
            <ArrowRight size={14} aria-hidden />
          </Button>
        </div>
      )}

      {/* Skip affordance for OPTIONAL tap-mode questions only. Required
          tap-mode questions force a selection. */}
      {tapMode && !question.required && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── Submitting / Error turns ──────────────────────────────────────────────────

function SubmittingTurn({
  agentPhoto,
  agentName,
  accentColor,
}: {
  agentPhoto?: string | null;
  agentName?: string;
  accentColor: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex items-start gap-2.5"
    >
      {/* Reuse the same gutter the agent avatar occupies in MessageBubble so
          the visual rhythm is consistent. */}
      <span
        className="w-6 h-6 rounded-full flex-shrink-0 inline-flex items-center justify-center"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      >
        <Loader2 className="w-3 h-3 text-white animate-spin" />
      </span>
      <p className="text-sm text-muted-foreground pt-0.5">
        Sending your answers…
      </p>
    </motion.div>
  );
}

function ErrorTurn({
  message,
  onRetry,
  accentColor,
}: {
  message: string;
  onRetry: () => void;
  accentColor: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
      className="flex items-start gap-2.5"
    >
      <span
        className="w-6 h-6 rounded-full flex-shrink-0 inline-flex items-center justify-center bg-destructive/15"
        aria-hidden
      >
        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
      </span>
      <div className="space-y-2 pt-0.5">
        <p className="text-sm text-foreground">{message}</p>
        <Button
          type="button"
          onClick={onRetry}
          variant="outline"
          className="h-8 rounded-full px-3 text-xs"
          style={{ borderColor: accentColor, color: accentColor }}
        >
          Try again
        </Button>
      </div>
    </motion.div>
  );
}

// Alias kept for backward-compatibility with the existing chat page import.
export { IntakeChat as IntakeChatView };
