'use client';

/**
 * /s/[slug]/support — Get help.
 *
 * One intent: a realtor submits a support request. The form is the focal
 * element; the realtor's own past tickets sit below it with status badges.
 *
 * Design: Jobs lens — paper-flat, one focal element (serif h1 + status
 * sentence), hairline-divided ticket list, calm copy. No configuration the
 * realtor has to operate — just say what's wrong and send it.
 */

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  CAPTION,
  META,
} from '@/lib/typography';
import {
  SupportingActionLink,
  SupportingMetric,
  SupportingMetricBand,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = 'bug' | 'question' | 'billing' | 'feature' | 'other';
type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  category: Category;
  status: TicketStatus;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  question: 'Question',
  bug: 'Something is broken',
  billing: 'Billing',
  feature: 'Feature request',
  other: 'Something else',
};

// Status pill tones — the canonical status palette from STYLESHEET.md.
const STATUS_STYLES: Record<TicketStatus, string> = {
  open: 'text-foreground bg-foreground/[0.06]',
  in_progress: 'text-muted-foreground bg-muted',
  resolved: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  closed: 'text-muted-foreground bg-muted',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const SUBJECT_MAX = 200;
const MESSAGE_MAX = 5000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main view ────────────────────────────────────────────────────────────────

export function SupportView({ slug }: { slug: string }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);

  const [category, setCategory] = useState<Category>('question');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const openCount = tickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'in_progress').length;
  const resolvedCount = tickets.filter((ticket) => ticket.status === 'resolved' || ticket.status === 'closed').length;

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch(`/api/support?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setTickets([]);
        return;
      }
      const data = (await res.json()) as { tickets?: Ticket[] };
      setTickets(data.tickets ?? []);
    } catch {
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleSubmit = async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject) {
      toastError('Add a subject.');
      return;
    }
    if (!trimmedMessage) {
      toastError('Add a message.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, category, subject: trimmedSubject, message: trimmedMessage }),
      });
      const data = (await res.json()) as { ticket?: Ticket; error?: string };
      if (!res.ok || !data.ticket) {
        toastError(data.error ?? 'Could not submit your request. Try again.');
        return;
      }
      setTickets((prev) => [data.ticket as Ticket, ...prev]);
      setSubject('');
      setMessage('');
      setCategory('question');
      setSubmitted(true);
      toastSuccess("We got it. We'll reply by email.");
    } catch {
      toastError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SupportingPage family="service" width="wide">
      <SupportingOrientation
        family="service"
        eyebrow="Support / Service desk"
        title="Tell us what is blocking the work"
        summary="Describe the outcome you expected and what happened instead. Replies go to your account email."
        nextAction={openCount > 0 ? 'Check the status of your open request before sending a duplicate.' : 'Include the affected page, the action you took, and what you expected to happen.'}
        action={<SupportingActionLink href="#support-request">Start a request</SupportingActionLink>}
        layout="rail"
      />
      <SupportingMetricBand>
        <SupportingMetric label="Open" value={openCount} detail="awaiting resolution" accent />
        <SupportingMetric label="Resolved" value={resolvedCount} detail="past requests" />
        <SupportingMetric label="Reply channel" value="Email" detail="sent to your account" />
        <SupportingMetric label="All requests" value={tickets.length} detail="in this workspace" />
      </SupportingMetricBand>
      <SupportingWorkArea className="grid gap-10 lg:grid-cols-[minmax(0,0.58fr)_minmax(19rem,0.42fr)] lg:items-start">
      <div id="support-request" className="scroll-mt-24">

      {/* ── Form ───────────────────────────────────────────────────────── */}
      {submitted ? (
        <div className="rounded-xl border border-border/70 bg-card px-6 py-8 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
            <LifeBuoy size={16} strokeWidth={1.75} className="text-muted-foreground" />
          </div>
          <p className={cn(BODY)}>We got it.</p>
          <p className={cn(BODY_MUTED)}>
            We&apos;ll reply by email. Your request is in the list below.
          </p>
          <Button variant="outline" size="sm" onClick={() => setSubmitted(false)}>
            Send another
          </Button>
        </div>
      ) : (
        <div className="chippi-dashboard-panel rounded-[1.75rem] px-6 py-6 space-y-4 sm:px-8 sm:py-8">
          <div className="space-y-1.5">
            <label htmlFor="support-category" className="text-sm font-medium text-foreground">
              What&apos;s this about?
            </label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger id="support-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="support-subject" className="text-sm font-medium text-foreground">
              Subject
            </label>
            <Input
              id="support-subject"
              value={subject}
              maxLength={SUBJECT_MAX}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="A short summary"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="support-message" className="text-sm font-medium text-foreground">
              Message
            </label>
            <Textarea
              id="support-message"
              value={message}
              maxLength={MESSAGE_MAX}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Walk us through what happened, and what you expected instead."
              rows={6}
            />
            <p className={cn(META)}>
              {message.length} / {MESSAGE_MAX}
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </div>
      )}
      </div>

      {/* ── Past tickets ───────────────────────────────────────────────── */}
      <section className="space-y-3 lg:sticky lg:top-8">
        <p className={cn(SECTION_LABEL)}>Your requests</p>

        {loadingTickets ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className={cn(BODY, 'text-muted-foreground')}>Loading&hellip;</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className={cn(BODY)}>No requests yet.</p>
            <p className={cn(CAPTION, 'mt-1')}>
              Anything you send will show up here with its status.
            </p>
          </div>
        ) : (
          <StaggerList key={tickets.length} className="divide-y divide-border/60">
            {tickets.map((t) => (
              <StaggerItem key={t.id}>
                <div className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn(BODY, 'font-medium truncate')}>{t.subject}</p>
                    <p className={cn(CAPTION, 'truncate mt-0.5')}>{t.message}</p>
                    <p className={cn(META, 'mt-1')}>
                      {CATEGORY_LABELS[t.category]} · {formatDate(t.createdAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 text-xs font-medium rounded-full px-2.5 py-0.5',
                      STATUS_STYLES[t.status],
                    )}
                  >
                    {STATUS_LABELS[t.status]}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </section>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
