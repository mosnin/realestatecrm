'use client';

/**
 * ChippiActivityToast — the cockpit's live readout for autonomous runs.
 *
 * Polls /api/agent/active-runs every few seconds; when an autonomous run
 * appears, opens an SSE stream to /api/agent/stream and surfaces the
 * agent's current tool call in a compact pill at the bottom-right of the
 * viewport. Auto-dismisses a few seconds after the run completes. This is
 * the live narration ("Chippi · find_contacts…") — there is no persistent
 * status badge; if Chippi has nothing to say, it says nothing.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type StreamEventType =
  | 'connected'
  | 'info'
  | 'action'
  | 'draft'
  | 'complete'
  | 'error'
  | 'timeout'
  | 'keepalive';

interface StreamEvent {
  type: StreamEventType;
  message: string;
  metadata?: { tool?: string; phase?: string };
  ts: number;
}

interface ActiveRunsResponse {
  runs: { runId: string; startedAt: number }[];
}

const POLL_INTERVAL_MS = 4_000;
const DISMISS_DELAY_MS = 3_500;

/**
 * Tool-name → realtor-facing verb phrase. Same vocabulary as the activity
 * feed so the toast and the transcript read in one voice. Anything not in
 * the map falls back to a sentence-case transform of the snake_case name,
 * which is still readable ("schedule_tour" → "Schedule tour").
 */
const TOOL_PHRASE: Record<string, string> = {
  search_contacts: 'Searching contacts',
  find_person: 'Searching contacts',
  get_contact: 'Looking up contact',
  search_deals: 'Searching deals',
  find_deal: 'Looking up deal',
  pipeline_summary: 'Analysing pipeline',
  find_stuck_deals: 'Reviewing stuck deals',
  find_quiet_hot_persons: 'Reviewing hot contacts',
  search_tours: 'Checking tours',
  find_tours: 'Checking tours',
  schedule_tour: 'Booking tour',
  reschedule_tour: 'Rescheduling tour',
  cancel_tour: 'Cancelling tour',
  check_availability: 'Checking availability',
  send_email: 'Sending email',
  draft_email: 'Drafting email',
  send_sms: 'Sending SMS',
  draft_sms: 'Drafting SMS',
  log_call: 'Logging call',
  log_meeting: 'Logging meeting',
  log_email_sent: 'Logging email',
  log_sms_sent: 'Logging SMS',
  recall_history: 'Recalling history',
  create_plan: 'Drafting plan',
  planner: 'Drafting plan',
  note_on_person: 'Saving note',
  note_on_deal: 'Saving note',
  note_on_property: 'Saving note',
  find_property: 'Looking up property',
  search_properties: 'Searching properties',
  add_property: 'Adding property',
  create_deal: 'Creating deal',
  mark_deal_won: 'Marking deal won',
  mark_deal_lost: 'Marking deal lost',
  move_deal_stage: 'Moving deal stage',
  update_deal_value: 'Updating deal value',
  update_deal_close_date: 'Updating close date',
  update_deal_probability: 'Updating probability',
  update_property_status: 'Updating property status',
  set_followup: 'Setting follow-up',
  clear_followup: 'Clearing follow-up',
  find_overdue_followups: 'Reviewing follow-ups',
  send_property_packet: 'Sending property packet',
  attach_property_to_deal: 'Linking property',
  attach_file_to_property: 'Attaching file',
  list_files: 'Listing files',
  read_file: 'Reading file',
  read_attachment: 'Reading attachment',
  get_note: 'Reading note',
  add_person: 'Adding contact',
  archive_person: 'Archiving contact',
  merge_persons: 'Merging contacts',
  mark_person_hot: 'Marking contact hot',
  mark_person_cold: 'Marking contact cold',
  assign_lead_to_realtor: 'Routing lead',
  request_deal_review: 'Requesting review',
  find_comparable_properties: 'Finding comps',
  summarize_realtor: 'Summarising realtor',
  propose_tour_times: 'Proposing tour times',
  add_checklist_item: 'Adding checklist item',
  block_time: 'Blocking time',
};

function humanizeToolName(rawName: string): string {
  const trimmed = rawName?.trim();
  if (!trimmed) return 'Working';
  if (TOOL_PHRASE[trimmed]) return TOOL_PHRASE[trimmed];
  // Sentence-case fallback so unknown tool names don't leak snake_case.
  const spaced = trimmed.replace(/_/g, ' ').trim();
  if (!spaced) return 'Working';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function ChippiActivityToast() {
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [latest, setLatest] = useState<StreamEvent | null>(null);
  const [done, setDone] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const pollOnce = useCallback(async () => {
    if (activeRunId) return; // already tracking one
    try {
      const res = await fetch('/api/agent/active-runs');
      if (!res.ok) return;
      const data = (await res.json()) as ActiveRunsResponse;
      if (data.runs.length > 0) setActiveRunId(data.runs[0].runId);
    } catch {
      // ignore — try again next poll
    }
  }, [activeRunId]);

  // Poll for active runs while we're not tracking one.
  useEffect(() => {
    void pollOnce();
    const interval = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pollOnce]);

  // Subscribe to the live event stream for the active run.
  useEffect(() => {
    if (!activeRunId) return;
    setDone(false);
    setLatest(null);

    const es = new EventSource(`/api/agent/stream?runId=${encodeURIComponent(activeRunId)}`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data) as StreamEvent;
        if (parsed.type === 'keepalive' || parsed.type === 'connected') return;
        setLatest(parsed);
        if (parsed.type === 'complete' || parsed.type === 'error' || parsed.type === 'timeout') {
          setDone(true);
          es.close();
        }
      } catch {
        // ignore malformed events
      }
    };
    es.onerror = () => {
      es.close();
      setDone(true);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [activeRunId]);

  // Auto-dismiss after the run terminates.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => {
      setActiveRunId(null);
      setLatest(null);
      setDone(false);
    }, DISMISS_DELAY_MS);
    return () => clearTimeout(t);
  }, [done]);

  const shouldShow = activeRunId !== null && latest !== null;
  const label = (() => {
    if (!latest) return '';
    if (done && latest.type === 'error') return 'Chippi · run failed';
    if (done) return 'Chippi · done';
    if (latest.metadata?.tool && latest.metadata.phase === 'start') {
      return `Chippi · ${humanizeToolName(latest.metadata.tool)}…`;
    }
    if (latest.metadata?.tool && latest.metadata.phase === 'complete') {
      return `Chippi · ${humanizeToolName(latest.metadata.tool)} done`;
    }
    return `Chippi · ${latest.message}`;
  })();

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="fixed bottom-4 right-4 z-40 max-w-[18rem] pointer-events-none"
          aria-live="polite"
        >
          <div
            className={cn(
              'flex items-center gap-2.5 px-3 py-2 rounded-full',
              'bg-foreground text-background shadow-lg shadow-foreground/10',
              'text-xs font-medium',
            )}
          >
            {done ? (
              <span
                aria-hidden
                className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                  latest?.type === 'error' ? 'bg-amber-400' : 'bg-emerald-400',
                )}
              />
            ) : (
              <Loader2 size={12} className="animate-spin flex-shrink-0" />
            )}
            <span className="truncate">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
