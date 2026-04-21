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
import { cn } from '@/lib/utils';
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
  token,
}: ApplicationStatusClientProps) {
  const [messages, setMessages] = useState<PortalMessage[]>(initialMessages);
  const [statusHistory] = useState<StatusUpdate[]>(initialHistory);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAppData, setShowAppData] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentConfig = getStatusConfig(contact.status);
  const CurrentIcon = currentConfig.icon;

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
        setSendError(errData?.error ?? 'Failed to send message. Please try again.');
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
    <div className="w-full max-w-lg space-y-4" role="main" aria-label="Application status portal">
      {/* Header Card */}
      <div className="rounded-xl bg-card border border-border/60 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {contact.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              Ref: {contact.applicationRef}
            </p>
            <p className="text-xs text-muted-foreground">
              Submitted {formatDate(contact.createdAt)}
            </p>
          </div>
          <div
            role="status"
            aria-label={`Application status: ${currentConfig.label}`}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0',
              currentConfig.bgColor,
              currentConfig.color,
            )}
          >
            <CurrentIcon size={13} aria-hidden="true" />
            {currentConfig.label}
          </div>
        </div>
        {contact.statusNote && (
          <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground font-medium mb-0.5">Note</p>
            <p className="text-sm text-foreground">{contact.statusNote}</p>
          </div>
        )}
      </div>

      {/* Status Timeline */}
      {statusHistory.length > 0 && (
        <nav aria-label="Application status timeline" className="rounded-xl bg-card border border-border/60 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Status Timeline</h2>
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
        </nav>
      )}

      {/* Application Summary (Collapsible) */}
      {appDisplayFields.length > 0 && (
        <div className="rounded-xl bg-card border border-border/60 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowAppData(!showAppData)}
            aria-expanded={showAppData}
            aria-controls="application-details-panel"
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors min-h-[44px]"
          >
            <h2 className="text-sm font-semibold text-foreground">
              Application Details
            </h2>
            {showAppData ? (
              <ChevronUp size={16} className="text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown size={16} className="text-muted-foreground" aria-hidden="true" />
            )}
          </button>
          {showAppData && (
            <div id="application-details-panel" className="px-5 pb-5 border-t border-border/40">
              {appSections.map(([title, fields]: [string, DisplayField[]]) => (
                <div key={title} className="mt-4">
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
        </div>
      )}

      {/* Messages */}
      <section aria-label="Messages" className="rounded-xl bg-card border border-border/60 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Messages</h2>
            {messages.length > 0 && (
              <span className="text-xs text-muted-foreground" aria-label={`${messages.length} messages`}>({messages.length})</span>
            )}
          </div>
          <button
            onClick={refreshData}
            disabled={refreshing}
            aria-label="Refresh messages"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>

        {/* Message list */}
        <div
          role="log"
          aria-live="polite"
          aria-label="Message history"
          className="max-h-80 overflow-y-auto px-5 py-3 space-y-3"
        >
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No messages yet. Send a message to {businessName} below.
            </p>
          ) : (
            messages.map((msg: PortalMessage) => {
              const isApplicant = msg.senderType === 'applicant';
              return (
                <div
                  key={msg.id}
                  className={cn('flex', isApplicant ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-xl px-3.5 py-2.5',
                      isApplicant
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm',
                    )}
                  >
                    <p className="text-xs font-medium mb-0.5 opacity-70">
                      {isApplicant ? 'You' : businessName}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    <time
                      dateTime={msg.createdAt}
                      className={cn(
                        'text-[10px] mt-1 block',
                        isApplicant ? 'text-primary-foreground/60' : 'text-muted-foreground',
                      )}
                    >
                      {formatTime(msg.createdAt)}
                    </time>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message input */}
        <div className="border-t border-border/40 px-4 py-3">
          {sendError && (
            <p role="alert" className="text-xs text-destructive mb-2">{sendError}</p>
          )}
          <div className="flex gap-2">
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
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={!messageText.trim() || sending}
              aria-label={sending ? 'Sending message' : 'Send message'}
              className={cn(
                'rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center text-sm font-medium transition-colors',
                messageText.trim() && !sending
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {sending ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
            </button>
          </div>
          <p id="message-char-count" className="text-[10px] text-muted-foreground mt-1.5" aria-live="polite">
            {messageText.length}/2000 characters
          </p>
        </div>
      </section>

      {/* What happens next */}
      <div className="rounded-xl bg-card border border-border/60 shadow-sm p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          What happens next?
        </p>
        <NextStepsText status={contact.status} businessName={businessName} />
      </div>
    </div>
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
      <div className="rounded-xl bg-card border border-border/60 shadow-sm p-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Application Status</h1>
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
