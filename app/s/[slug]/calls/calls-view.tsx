'use client';

/**
 * /s/[slug]/calls — Call log.
 *
 * One intent: a quiet record of who you called and what Chippi heard. Each row
 * is a call with a status pill, the contact (or number), and how long it ran.
 * Tap a row to expand its Chippi summary and full transcript.
 *
 * Design: Jobs lens — paper-flat, hairline-divided rows, calm copy. The
 * summary is the focal payoff inside an expanded row; the transcript sits
 * quietly beneath it. No configuration the realtor operates here — placing a
 * call happens from a contact; this surface is the memory.
 */

import { useCallback, useEffect, useState } from 'react';
import { Phone, ChevronDown } from 'lucide-react';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { cn } from '@/lib/utils';
import {
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  CAPTION,
  META,
  PRIMARY_PILL,
} from '@/lib/typography';

// ── Types ───────────────────────────────────────────────────────────────────

type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'completed'
  | 'failed'
  | 'no_answer';

interface Call {
  id: string;
  contactId: string | null;
  contactName: string | null;
  direction: 'outbound' | 'inbound';
  fromNumber: string;
  toNumber: string;
  status: CallStatus;
  recordingUrl: string | null;
  transcript: string | null;
  summary: string | null;
  durationSec: number | null;
  createdAt: string;
}

// Status pill tones — monochrome; the label carries the state. A failed call
// keeps the rose error token (a genuine failure), everything else is neutral.
const STATUS_STYLES: Record<CallStatus, string> = {
  initiated: 'text-muted-foreground bg-muted',
  ringing: 'text-muted-foreground bg-muted',
  answered: 'text-muted-foreground bg-muted',
  completed: 'text-foreground bg-foreground/[0.06]',
  no_answer: 'text-muted-foreground bg-muted',
  failed: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
};

const STATUS_LABELS: Record<CallStatus, string> = {
  initiated: 'Calling',
  ringing: 'Ringing',
  answered: 'Connected',
  completed: 'Completed',
  no_answer: 'No answer',
  failed: 'Failed',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function statusSentence(calls: Call[]): string {
  if (calls.length === 0) return 'Your calls land here, recorded and summarized.';
  const last = calls[0];
  const who = last.contactName ?? last.toNumber;
  return `Last call: ${who}.`;
}

// ── Main view ────────────────────────────────────────────────────────────────

export function CallsView({ slug }: { slug: string }) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [placing, setPlacing] = useState(false);
  const [voiceConfigured, setVoiceConfigured] = useState<boolean | null>(null);

  const fetchCalls = useCallback(async () => {
    try {
      const res = await fetch(`/api/calls?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setCalls([]);
        return;
      }
      const data = (await res.json()) as { calls?: Call[]; configured?: boolean };
      setCalls(data.calls ?? []);
      setVoiceConfigured(data.configured === true);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const placeCall = async () => {
    const to = number.trim();
    if (!to) {
      toastError('Enter a number to call.');
      return;
    }
    setPlacing(true);
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, toNumber: to }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        configured?: boolean;
        message?: string;
      };
      // Validation / auth / rate-limit failures are non-2xx.
      if (!res.ok) {
        toastError(data.error ?? 'Could not place the call.');
        return;
      }
      // The route returns 200 even when voice isn't set up; the signal is
      // `configured: false`. Show the reason and refresh the log either way.
      if (data.configured === false) {
        toastError(data.message ?? 'Calling is not set up for this workspace yet.');
        fetchCalls();
        return;
      }
      setNumber('');
      toastSuccess('Calling — your phone rings first, then we connect you.');
      fetchCalls();
    } catch {
      toastError('Could not place the call.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="chippi-dashboard-canvas mx-auto max-w-5xl space-y-10 pb-12 pt-3 sm:pt-5" data-page-family="call-memory">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="grid gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end lg:gap-16">
        <div className="max-w-3xl space-y-3">
          <p className={SECTION_LABEL}>Conversation memory</p>
          <h1 className="text-[3rem] leading-[.96] tracking-[-0.045em] sm:text-[4.5rem]" style={TITLE_FONT}>
            Call once. Remember every detail.
          </h1>
          <p className={cn(BODY_MUTED)}>
            {statusSentence(calls)}{' '}
            {voiceConfigured === false
              ? 'Phone setup is still pending — summaries and transcripts attach here once calling is configured.'
              : 'Chippi keeps the summary and transcript attached to the relationship.'}
          </p>
        </div>
        <div className="flex items-end gap-3 lg:justify-end">
          <span className="text-[5rem] leading-[.78] tracking-[-0.06em] tabular-nums" style={TITLE_FONT}>{calls.length}</span>
          <span className="pb-1.5 text-sm text-muted-foreground">recorded calls</span>
        </div>
      </header>

      {/* ── Start a call ───────────────────────────────────────────────── */}
      <section className="chippi-dashboard-panel grid gap-5 rounded-[1.75rem] p-6 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,.85fr)] sm:items-end sm:p-8">
        <div>
          <p className={cn(SECTION_LABEL)}>Start a call</p>
          <p className="mt-2 text-2xl tracking-tight text-foreground" style={TITLE_FONT}>
            {voiceConfigured === false ? 'Calling waits on phone setup.' : 'Make the next conversation count.'}
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
          <Input
            type="tel"
            inputMode="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !placing) placeCall();
            }}
            placeholder="+1 (555) 123-4567"
            className="flex-1"
            disabled={placing || voiceConfigured !== true}
          />
          <Button
            onClick={placeCall}
            disabled={placing || voiceConfigured !== true || !number.trim()}
            className={PRIMARY_PILL}
          >
            <Phone size={14} strokeWidth={2} className="mr-1.5" />
            {placing ? 'Calling…' : 'Call'}
          </Button>
          </div>
          {voiceConfigured === false ? (
            <p className={cn(CAPTION, 'text-amber-700 dark:text-amber-400')}>
              Calling is not available yet. Ask your administrator to finish phone setup.
            </p>
          ) : (
            <p className={cn(CAPTION)}>
              Your phone rings first; once you pick up, we connect you to the contact and record the
              call. Chippi summarizes it when it ends.
            </p>
          )}
        </div>
      </section>

      {/* ── List ───────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={cn(SECTION_LABEL)}>Recent calls</p>

        {loading ? (
          <div className="border-y border-border/60 px-5 py-10 text-center">
            <p className={cn(BODY, 'text-muted-foreground')}>Loading&hellip;</p>
          </div>
        ) : calls.length === 0 ? (
          <div className="border-y border-border/60 px-5 py-10 text-center">
            <p className={cn(BODY)}>No calls yet.</p>
            <p className={cn(CAPTION, 'mt-1')}>
              {voiceConfigured === false
                ? 'Call history will appear here after phone setup is complete.'
                : 'Call a contact and the recording, transcript, and summary show up here.'}
            </p>
          </div>
        ) : (
          <StaggerList key={calls.length} className="divide-y divide-border/60 border-y border-border/60">
            {calls.map((c) => {
              const isOpen = expanded === c.id;
              const duration = formatDuration(c.durationSec);
              const hasDetail = Boolean(c.summary || c.transcript);
              return (
                <StaggerItem key={c.id}>
                  <div className="py-3">
                    <button
                      type="button"
                      onClick={() => hasDetail && setExpanded(isOpen ? null : c.id)}
                      className={cn(
                        'w-full flex items-start gap-3 text-left rounded-lg -mx-2 px-2 py-1',
                        hasDetail && 'hover:bg-foreground/[0.04] transition-colors',
                      )}
                      aria-expanded={isOpen}
                    >
                      <div className="flex-1 min-w-0">
                        <p className={cn(BODY, 'font-medium truncate')}>
                          {c.contactName ?? c.toNumber}
                        </p>
                        <p className={cn(META, 'mt-1')}>
                          {formatDate(c.createdAt)}
                          {duration ? ` · ${duration}` : ''}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 text-xs font-medium rounded-full px-2.5 py-0.5',
                          STATUS_STYLES[c.status],
                        )}
                      >
                        {STATUS_LABELS[c.status]}
                      </span>
                      {hasDetail && (
                        <ChevronDown
                          size={14}
                          strokeWidth={1.75}
                          className={cn(
                            'mt-1.5 shrink-0 text-muted-foreground transition-transform',
                            isOpen && 'rotate-180',
                          )}
                        />
                      )}
                    </button>

                    {isOpen && hasDetail && (
                      <div className="mt-3 space-y-4">
                        {c.summary && (
                          <div className="space-y-1.5">
                            <p className={cn(SECTION_LABEL)}>Chippi summary</p>
                            <p className={cn(BODY)}>{c.summary}</p>
                          </div>
                        )}
                        {c.transcript && (
                          <div className="space-y-1.5">
                            <p className={cn(SECTION_LABEL)}>Transcript</p>
                            <p className={cn(CAPTION, 'whitespace-pre-wrap leading-relaxed')}>
                              {c.transcript}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerList>
        )}
      </section>
    </div>
  );
}
