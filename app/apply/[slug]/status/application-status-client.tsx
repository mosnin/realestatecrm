'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Inbox,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { TITLE_FONT } from '@/lib/typography';
import type { IntakeFormConfig, ApplicationData } from '@/lib/types';
import { getSubmissionDisplay, type DisplayField } from '@/lib/form-versioning';

// ── Types ─────────────────────────────────────────────────────────────────────

interface StatusUpdate {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
}

interface PortalMessage {
  id: string;
  senderType: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

interface PortalTour {
  id: string;
  startsAt: string;
  endsAt: string;
  propertyAddress: string | null;
  notes: string | null;
  status: string;
}

interface ApplicationStatusClientProps {
  contact: {
    name: string;
    status: string;
    statusNote: string | null;
    applicationRef: string;
    applicationData: Record<string, unknown> | ApplicationData | null;
    formConfigSnapshot: IntakeFormConfig | null;
    createdAt: string;
  };
  businessName: string;
  portalMode: boolean;
  statusHistory: StatusUpdate[];
  messages: PortalMessage[];
  tours: PortalTour[];
  token: string | null;
  slug: string;
}

// ── Status Configuration ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Inbox; color: string; bgColor: string }
> = {
  received: {
    label: 'Received',
    icon: Inbox,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  under_review: {
    label: 'Under Review',
    icon: Search,
    color: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
  },
  tour_scheduled: {
    label: 'Tour Scheduled',
    icon: CalendarCheck,
    color: 'text-violet-500',
    bgColor: 'bg-violet-100 dark:bg-violet-900/30',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
  },
  waitlisted: {
    label: 'Waitlisted',
    icon: Clock,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
  needs_info: {
    label: 'Needs Info',
    icon: AlertCircle,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-900/30',
  },
};

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG.received;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ApplicationStatusClient({
  contact,
  businessName,
  portalMode,
  statusHistory: initialHistory,
  messages: initialMessages,
  tours: initialTours,
  token,
}: ApplicationStatusClientProps) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [statusHistory] = useState<StatusUpdate[]>(initialHistory);
  const [tours, setTours] = useState<PortalTour[]>(initialTours);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAppData, setShowAppData] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const reduce = useReducedMotion();
  const currentConfig = getStatusConfig(contact.status);
  const CurrentIcon = currentConfig.icon;

  // Shared card-entrance variants — every panel rises in sequence so the
  // portal lands as one calm reveal, matching the intake's motion language.
  // Reduced-motion collapses to opacity-only with no stagger.
  const cardVariants = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    enter: { opacity: 1, y: 0, transition: { duration: DURATION_BASE, ease: EASE_OUT } },
  };

  // Scroll to bottom of messages when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-refresh messages every 30 seconds in portal mode
  useEffect(() => {
    if (!portalMode || !token) return;

    const interval = setInterval(() => {
      refreshData();
    }, 30000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portalMode, token]);

  const refreshData = useCallback(async () => {
    if (!token || !contact.applicationRef) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/applications/portal?ref=${encodeURIComponent(contact.applicationRef)}&token=${encodeURIComponent(token)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        if (Array.isArray(data.tours)) setTours(data.tours);
      }
    } catch (err) {
      console.error('[portal] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [token, contact.applicationRef]);

  const sendMessage = useCallback(async () => {
    if (!messageText.trim() || !token || sending) return;
    setSending(true);
    setSendError(null);

    try {
      const res = await fetch('/api/applications/portal/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationRef: contact.applicationRef,
          token,
          content: messageText.trim(),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev: PortalMessage[]) => [...prev, data.message]);
        setMessageText('');
      } else if (res.status === 429) {
        setSendError('Too many messages. Please wait before sending again.');
      } else {
        const errData = await res.json().catch(() => null);
        setSendError(errData?.error ?? "Message didn't go through — usually temporary.");
      }
    } catch {
      setSendError('Failed to send message. Please check your connection.');
    } finally {
      setSending(false);
    }
  }, [messageText, token, sending, contact.applicationRef]);

  // Application data display fields
  const appDisplayFields = useMemo(() => {
    if (!contact.applicationData) return [];
    return getSubmissionDisplay({
      applicationData: contact.applicationData,
      formConfigSnapshot: contact.formConfigSnapshot,
    });
  }, [contact.applicationData, contact.formConfigSnapshot]);

  // Group display fields by section
  const appSections = useMemo(() => {
    const map = new Map<string, DisplayField[]>();
    for (const field of appDisplayFields) {
      const key = field.sectionTitle ?? 'Details';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(field);
    }
    return Array.from(map.entries());
  }, [appDisplayFields]);

  // ── If not portal mode, show the simple status view (backwards compat) ──
  if (!portalMode) {
    return <SimpleStatusView contact={contact} businessName={businessName} />;
  }

  // ── Full Portal Mode ────────────────────────────────────────────────────

  return (
    <motion.div
      className="w-full max-w-lg space-y-12"
      role="main"
      aria-label="Application status portal"
      initial="initial"
      animate="enter"
      variants={{
        initial: {},
        enter: { transition: { staggerChildren: reduce ? 0 : 0.06 } },
      }}
    >
      {/* Status hero — the words lead. The current status reads as a focal
          serif line, the same focal vocabulary the intake question uses;
          the status icon is quieted to a small inline mark so it never
          competes with the headline. */}
      <motion.div variants={cardVariants}>
        <div
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          role="status"
          aria-label={`Application status: ${currentConfig.label}`}
        >
          <CurrentIcon size={13} className={currentConfig.color} aria-hidden="true" />
          <span>For {contact.name}</span>
        </div>
        <h1
          className="mt-2 text-3xl sm:text-4xl tracking-tight text-foreground"
          style={TITLE_FONT}
        >
          {currentConfig.label}
        </h1>
        {contact.statusNote && (
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            {contact.statusNote}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Ref {contact.applicationRef} · Submitted {formatDate(contact.createdAt)}
        </p>
      </motion.div>

      {/* Status Timeline — a clean vertical list on the canvas, no card. */}
      {statusHistory.length > 0 && (
        <motion.nav variants={cardVariants} aria-label="Application status timeline">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-5">Timeline</h2>
          <ol className="space-y-0 list-none m-0 p-0" aria-label="Status updates">
            {statusHistory.map((update: StatusUpdate, i: number) => {
              const config = getStatusConfig(update.toStatus);
              const Icon = config.icon;
              const isLast = i === statusHistory.length - 1;

              return (
                <li
                  key={update.id}
                  className="flex gap-3"
                  aria-current={isLast ? 'step' : undefined}
                >
                  {/* Timeline line + dot */}
                  <div className="flex flex-col items-center" aria-hidden="true">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2',
                        isLast
                          ? `${config.bgColor} border-current ${config.color}`
                          : 'bg-muted border-border',
                      )}
                    >
                      <Icon
                        size={12}
                        className={cn(isLast ? config.color : 'text-muted-foreground')}
                      />
                    </div>
                    {!isLast && (
                      <div className="w-px flex-1 min-h-[24px] bg-border" />
                    )}
                  </div>

                  {/* Content */}
                  <div className={cn('pb-4 min-w-0', isLast && 'pb-0')}>
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isLast ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {config.label}
                      {isLast && <span className="sr-only"> (current status)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDateTime(update.createdAt)}
                    </p>
                    {update.note && (
                      <p className="text-xs text-foreground/80 mt-1 bg-muted/50 rounded px-2 py-1">
                        {update.note}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </motion.nav>
      )}

      {/* Application Summary (Collapsible) — de-boxed; the expand control
          and the field rows sit directly on the canvas with hairline
          separators between sections. */}
      {appDisplayFields.length > 0 && (
        <motion.div variants={cardVariants}>
          <button
            onClick={() => setShowAppData(!showAppData)}
            aria-expanded={showAppData}
            aria-controls="application-details-panel"
            className="w-full flex items-center justify-between text-left transition-colors min-h-[44px] text-muted-foreground hover:text-foreground"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wider">
              Application Details
            </h2>
            {showAppData ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
          {showAppData && (
            <div id="application-details-panel" className="mt-5 divide-y divide-border/40">
              {appSections.map(([title, fields]: [string, DisplayField[]]) => (
                <div key={title} className="py-4 first:pt-0">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {title}
                  </p>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {fields.map((field: DisplayField, i: number) => (
                      <div key={i}>
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="text-sm font-medium text-foreground m-0">{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Your tours — what's scheduled, awaiting confirmation, or completed.
          Each scheduled tour gets a Confirm / Can't make it action pair so
          the realtor doesn't have to chase the applicant via SMS. */}
      {token && contact.applicationRef && tours.length > 0 && (
        <motion.div variants={cardVariants}>
          <YourToursPanel
            applicationRef={contact.applicationRef}
            token={token}
            tours={tours}
            onResponded={() => { void refreshData(); }}
          />
        </motion.div>
      )}

      {/* Tour request — quiet CTA above the message thread. Opens an inline
          form; submit lands as a structured AgentQuestion in the realtor's
          Chippi focus card and as a message in this thread. Only rendered
          when the applicant is authenticated via portal token. */}
      {token && contact.applicationRef && (
        <motion.div variants={cardVariants}>
          <TourRequestPanel
            applicationRef={contact.applicationRef}
            token={token}
            onSubmitted={() => { void refreshData(); }}
          />
        </motion.div>
      )}

      {/* Messages — on canvas, no card. The thread and the composer sit
          directly on the warm surface; only a hairline marks the section. */}
      <motion.section variants={cardVariants} aria-label="Messages">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-muted-foreground" aria-hidden="true" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Messages</h2>
            {messages.length > 0 && (
              <span className="text-xs text-muted-foreground" aria-label={`${messages.length} messages`}>({messages.length})</span>
            )}
          </div>
          <button
            onClick={refreshData}
            disabled={refreshing}
            aria-label="Refresh messages"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-foreground/[0.04] transition-colors text-muted-foreground"
          >
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>

        {/* Message list */}
        <div
          role="log"
          aria-live="polite"
          aria-label="Message history"
          className="max-h-80 overflow-y-auto space-y-3"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No messages yet. Send a message to {businessName} below.
            </p>
          ) : (
            messages.map((msg: PortalMessage) => {
              const isApplicant = msg.senderType === 'applicant';
              return (
                <motion.div
                  key={msg.id}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
                  className={cn('flex', isApplicant ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[80%] border px-3.5 py-2.5',
                      // The applicant's own voice gets the same warm
                      // orange-tinted bubble the intake gave their answers —
                      // continuity from the conversation they just finished,
                      // not a cold black slab. The realtor sits in neutral.
                      isApplicant
                        ? 'rounded-2xl rounded-br-md border-orange-200/70 bg-orange-50 text-foreground dark:border-orange-500/25 dark:bg-orange-500/10'
                        : 'rounded-2xl rounded-bl-md border-border/60 bg-muted text-foreground',
                    )}
                  >
                    <p className="text-xs font-medium mb-0.5 text-muted-foreground">
                      {isApplicant ? 'You' : businessName}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                    <time
                      dateTime={msg.createdAt}
                      className="text-[10px] mt-1 block text-muted-foreground"
                    >
                      {formatTime(msg.createdAt)}
                    </time>
                  </div>
                </motion.div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message composer — the intake's pill composer vocabulary, on
            canvas: a rounded-[26px] field with a circular send button. */}
        <div className="mt-4">
          {sendError && (
            <p role="alert" className="text-xs text-destructive mb-2">{sendError}</p>
          )}
          <div className="flex items-end gap-2 rounded-[26px] border border-border/70 bg-background/80 py-2 pl-5 pr-2.5 backdrop-blur-sm transition-colors duration-150 focus-within:border-foreground/40">
            <input
              type="text"
              value={messageText}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMessageText(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              aria-label={`Message ${businessName}`}
              aria-describedby="message-char-count"
              placeholder={`Message ${businessName}...`}
              maxLength={2000}
              className="flex-1 bg-transparent py-2 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!messageText.trim() || sending}
              aria-label={sending ? 'Sending message' : 'Send message'}
              className={cn(
                'mb-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center self-end rounded-full transition-all duration-150 active:scale-[0.94]',
                messageText.trim() && !sending
                  ? 'bg-foreground text-background'
                  : 'cursor-not-allowed bg-foreground/15 text-foreground/40',
              )}
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
            </button>
          </div>
          <p id="message-char-count" className="text-[10px] text-muted-foreground mt-1.5 px-2" aria-live="polite">
            {messageText.length}/2000 characters
          </p>
        </div>
      </motion.section>

      {/* What happens next — on canvas, separated by a single hairline. */}
      <motion.div variants={cardVariants} className="border-t border-border/40 pt-8">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          What happens next?
        </p>
        <NextStepsText status={contact.status} businessName={businessName} />
      </motion.div>
    </motion.div>
  );
}

// ── Simple Status View (no portal token — backwards compatible) ───────────────

function SimpleStatusView({
  contact,
  businessName,
}: {
  contact: {
    name: string;
    status: string;
    statusNote: string | null;
    createdAt: string;
  };
  businessName: string;
}) {
  const STATUSES = [
    {
      key: 'received',
      label: 'Received',
      icon: Inbox,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      key: 'under_review',
      label: 'Under Review',
      icon: Search,
      color: 'text-amber-500',
      bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    },
    {
      key: 'approved',
      label: 'Approved',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      key: 'needs_info',
      label: 'Needs Info',
      icon: AlertCircle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-100 dark:bg-orange-900/30',
    },
    {
      key: 'declined',
      label: 'Declined',
      icon: XCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-100 dark:bg-red-900/30',
    },
  ];

  const currentIndex = STATUSES.findIndex((s) => s.key === contact.status);

  const progressSteps = STATUSES.filter((s) => {
    if (s.key === 'needs_info' && contact.status !== 'needs_info') return false;
    if (s.key === 'declined' && contact.status !== 'declined') return false;
    if (s.key === 'approved' && contact.status === 'declined') return false;
    return true;
  });

  return (
    <div className="w-full max-w-md" role="main" aria-label="Application status">
      <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl tracking-tight text-foreground" style={TITLE_FONT}>
            Application Status
          </h1>
          <p className="text-sm text-muted-foreground">for {contact.name}</p>
          <p className="text-xs text-muted-foreground">
            Submitted{' '}
            {new Date(contact.createdAt).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>

        {/* Current status */}
        {(() => {
          const current = STATUSES.find((s) => s.key === contact.status) || STATUSES[0];
          const Icon = current.icon;
          return (
            <div role="status" aria-label={`Current status: ${current.label}`} className={cn('rounded-xl p-5 text-center', current.bgColor)}>
              <Icon size={32} className={cn('mx-auto mb-2', current.color)} aria-hidden="true" />
              <p className={cn('text-lg font-semibold', current.color)}>{current.label}</p>
              {contact.statusNote && (
                <p className="text-sm text-foreground mt-2">{contact.statusNote}</p>
              )}
            </div>
          );
        })()}

        {/* Progress tracker */}
        <nav aria-label="Application progress">
          <ol className="space-y-0 list-none m-0 p-0">
            {progressSteps.map((step, i) => {
              const Icon = step.icon;
              const stepIdx = STATUSES.findIndex((s) => s.key === step.key);
              const isCurrent = step.key === contact.status;
              const isPast = stepIdx < currentIndex;
              const isLast = i === progressSteps.length - 1;

              return (
                <li key={step.key} className="flex items-start gap-3" aria-current={isCurrent ? 'step' : undefined}>
                  <div className="flex flex-col items-center" aria-hidden="true">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                        isPast || isCurrent ? step.bgColor : 'bg-muted',
                      )}
                    >
                      <Icon
                        size={14}
                        className={cn(
                          isPast || isCurrent
                            ? step.color
                            : 'text-muted-foreground/30',
                        )}
                      />
                    </div>
                    {!isLast && (
                      <div
                        className={cn(
                          'w-px h-6',
                          isPast
                            ? 'bg-emerald-300 dark:bg-emerald-700'
                            : 'bg-border',
                        )}
                      />
                    )}
                  </div>
                  <div className="pt-1.5">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isCurrent
                          ? 'text-foreground'
                          : isPast
                          ? 'text-muted-foreground'
                          : 'text-muted-foreground/40',
                      )}
                    >
                      {step.label}
                      {isCurrent && <span className="sr-only"> (current status)</span>}
                      {isPast && <span className="sr-only"> (completed)</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* What happens next */}
        <div className="rounded-xl bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            What happens next?
          </p>
          <NextStepsText status={contact.status} businessName={businessName} />
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Questions? Contact {businessName} directly.
        </p>
      </div>
    </div>
  );
}

// ── Shared Next Steps Text ────────────────────────────────────────────────────

/**
 * Your-tours panel — surfaces tours linked to this contact. Three states
 * per tour:
 *   - scheduled  → applicant sees Confirm / Can't make it actions
 *   - confirmed  → applicant sees a calm "Confirmed" badge, no actions
 *   - completed  → quiet receipt; no actions
 *
 * Read-only views (no token) skip this panel entirely; the parent gates
 * rendering on `token && tours.length > 0`. The respond endpoint is
 * idempotent so double-clicks don't double-message the realtor.
 */
function YourToursPanel({
  applicationRef,
  token,
  tours,
  onResponded,
}: {
  applicationRef: string;
  token: string;
  tours: PortalTour[];
  onResponded: () => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(tourId: string, action: 'confirm' | 'decline') {
    setPending(`${action}:${tourId}`);
    setError(null);
    try {
      const res = await fetch(`/api/applications/portal/tour/${tourId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationRef, token, action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Response didn't go through — usually temporary.");
        return;
      }
      onResponded();
    } catch {
      setError("Couldn't reach the server — usually temporary.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-label="Your tours">
      <div className="mb-4 flex items-center gap-2">
        <CalendarCheck size={14} className="text-muted-foreground" aria-hidden="true" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your tours</h2>
        <span className="text-xs text-muted-foreground">({tours.length})</span>
      </div>

      <ul className="divide-y divide-border/40">
        {tours.map((tour) => {
          const startsAt = new Date(tour.startsAt);
          const dateLine = startsAt.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
          const isScheduled = tour.status === 'scheduled';
          const isConfirmed = tour.status === 'confirmed';
          const isCompleted = tour.status === 'completed';
          const confirming = pending === `confirm:${tour.id}`;
          const declining = pending === `decline:${tour.id}`;

          return (
            <li key={tour.id} className="py-4 first:pt-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {dateLine}
                  </p>
                  {tour.propertyAddress && (
                    <p className="text-xs text-muted-foreground">{tour.propertyAddress}</p>
                  )}
                  {tour.notes && (
                    <p className="text-xs text-muted-foreground italic leading-relaxed">
                      {tour.notes}
                    </p>
                  )}
                </div>
                <div
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium flex-shrink-0',
                    isConfirmed && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
                    isScheduled && 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
                    isCompleted && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isConfirmed && <CheckCircle2 size={11} aria-hidden="true" />}
                  {isScheduled && <Clock size={11} aria-hidden="true" />}
                  {isCompleted && <CalendarCheck size={11} aria-hidden="true" />}
                  {isConfirmed ? 'Confirmed' : isScheduled ? 'Awaiting your confirmation' : 'Completed'}
                </div>
              </div>

              {isScheduled && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void respond(tour.id, 'confirm')}
                    disabled={!!pending}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-7 text-sm font-semibold transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirming ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <CheckCircle2 size={12} aria-hidden="true" />}
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(tour.id, 'decline')}
                    disabled={!!pending}
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-border/70 bg-transparent text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] px-7 text-sm font-medium transition-colors duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {declining ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <XCircle size={12} aria-hidden="true" />}
                    Can&apos;t make it
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <div role="alert" className="mt-3 pt-3 border-t border-border/40 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

/**
 * Tour-request panel — collapsed by default to keep the portal calm.
 * Click "Request a tour" → inline form opens. Submit hits
 * /api/applications/portal/tour-request, which logs an ApplicationMessage
 * (visible immediately in the thread below) and creates an AgentQuestion
 * scoped to the realtor (visible in their Chippi focus card).
 *
 * Single primary CTA + a Cancel link. Sweat-the-detail rules:
 *   - placeholder text is example-driven, not instructions
 *   - field labels read as one short sentence, not form-y "Property *"
 *   - submit button is disabled until the only required field has content
 *   - on success the form collapses and a small confirmation appears
 *   - rate-limit / network errors surface inline, not as a toast (the
 *     applicant may be on a slow connection in a hallway)
 */
function TourRequestPanel({
  applicationRef,
  token,
  onSubmitted,
}: {
  applicationRef: string;
  token: string;
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [preferredTimes, setPreferredTimes] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const canSubmit = preferredTimes.trim().length > 0 && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/applications/portal/tour-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationRef,
          token,
          preferredTimes,
          propertyAddress,
          notes,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setSubmitError(data?.error ?? "Request didn't go through — usually temporary.");
        return;
      }
      // Reset + collapse
      setPreferredTimes('');
      setPropertyAddress('');
      setNotes('');
      setOpen(false);
      setConfirmed(true);
      onSubmitted();
    } catch {
      setSubmitError("Couldn't reach the server — usually temporary.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed && !open) {
    return (
      <div role="status" className="flex items-center gap-3">
        <CalendarCheck size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-medium text-foreground">Tour request sent.</p>
          <p className="text-muted-foreground">Your realtor will respond shortly.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setConfirmed(false);
            setOpen(true);
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Request another
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left flex items-center gap-3 group transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-foreground/[0.04] group-hover:bg-foreground/[0.08] flex items-center justify-center flex-shrink-0 transition-colors">
          <CalendarCheck size={14} className="text-muted-foreground group-hover:text-foreground transition-colors" strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Request a tour</p>
          <p className="text-xs text-muted-foreground">Tell your realtor when you&apos;re free; they&apos;ll set it up.</p>
        </div>
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Request a tour">
      <div className="flex items-center gap-2">
        <CalendarCheck size={14} className="text-muted-foreground" aria-hidden="true" />
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Request a tour</h2>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tour-times" className="text-xs font-medium text-muted-foreground">
          When are you free?
        </label>
        <textarea
          id="tour-times"
          rows={2}
          value={preferredTimes}
          onChange={(e) => setPreferredTimes(e.target.value)}
          disabled={submitting}
          placeholder="Saturday or Sunday afternoon · weekday evenings after 6"
          className="w-full rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm transition-colors duration-150 outline-none focus:border-foreground/40 disabled:opacity-50 resize-none placeholder:text-muted-foreground/50"
          maxLength={500}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tour-address" className="text-xs font-medium text-muted-foreground">
          Property (optional)
        </label>
        <input
          id="tour-address"
          type="text"
          value={propertyAddress}
          onChange={(e) => setPropertyAddress(e.target.value)}
          disabled={submitting}
          placeholder="25 Park Slope Place, Brooklyn"
          className="w-full rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm transition-colors duration-150 outline-none focus:border-foreground/40 disabled:opacity-50 placeholder:text-muted-foreground/50"
          maxLength={300}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tour-notes" className="text-xs font-medium text-muted-foreground">
          Anything else? (optional)
        </label>
        <textarea
          id="tour-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={submitting}
          placeholder="Bringing my partner; we'd love a video walkthrough first if possible."
          className="w-full rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm transition-colors duration-150 outline-none focus:border-foreground/40 disabled:opacity-50 resize-none placeholder:text-muted-foreground/50"
          maxLength={1000}
        />
      </div>

      {submitError && (
        <div role="alert" className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-foreground text-background px-7 text-sm font-semibold transition-opacity duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
          Send request
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSubmitError(null);
          }}
          disabled={submitting}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function NextStepsText({ status, businessName }: { status: string; businessName: string }) {
  switch (status) {
    case 'received':
      return (
        <p className="text-sm text-muted-foreground">
          {businessName} will review your application and may reach out with questions. This
          typically takes 1-3 business days.
        </p>
      );
    case 'under_review':
      return (
        <p className="text-sm text-muted-foreground">
          Your application is actively being reviewed. {businessName} may contact you for
          additional information. Hang tight!
        </p>
      );
    case 'tour_scheduled':
      return (
        <p className="text-sm text-muted-foreground">
          A tour has been scheduled for you. {businessName} will reach out with details about
          timing and location.
        </p>
      );
    case 'approved':
      return (
        <p className="text-sm text-muted-foreground">
          Congratulations! {businessName} will reach out with next steps, including lease signing
          details.
        </p>
      );
    case 'waitlisted':
      return (
        <p className="text-sm text-muted-foreground">
          You are on the waitlist. {businessName} will notify you if a spot becomes available.
        </p>
      );
    case 'needs_info':
      return (
        <p className="text-sm text-muted-foreground">
          {businessName} needs additional information to process your application. Please check
          your messages or email for details.
        </p>
      );
    case 'declined':
      return (
        <p className="text-sm text-muted-foreground">
          Unfortunately your application was not approved at this time. {businessName} may provide
          more details separately.
        </p>
      );
    default:
      return (
        <p className="text-sm text-muted-foreground">
          {businessName} will review your application and reach out with updates.
        </p>
      );
  }
}
