'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, Send, CheckCircle2, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

interface AgentQuestion {
  id: string;
  agentType: string;
  question: string;
  context: string | null;
  priority: number;
  contactId: string | null;
  Contact: { id: string; name: string } | null;
  createdAt: string;
  status: 'pending' | 'answered' | 'expired';
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatAgentType(raw: string): string {
  return raw
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  onAnswered,
}: {
  question: AgentQuestion;
  onAnswered: (id: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answeredOk, setAnsweredOk] = useState(false);
  const [fading, setFading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isHighPriority = question.priority >= 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = answer.trim();
    if (!trimmed) {
      setError('Please write an answer');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/agent/questions/${question.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setAnsweredOk(true);
      // Show "Answered ✓" briefly, then fade out and remove
      setTimeout(() => {
        setFading(true);
        setTimeout(() => onAnswered(question.id), 300);
      }, 700);
    } catch {
      setError('Could not submit — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article
      role="article"
      className={cn(
        'rounded-xl border border-border bg-card overflow-hidden transition-opacity duration-300',
        fading && 'opacity-0',
        isHighPriority ? 'border-l-[3px] border-l-amber-400' : 'border-l-[3px] border-l-blue-400',
      )}
    >
      <div className="px-4 pt-4 pb-3 space-y-2.5">
        {/* Top meta row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Agent type badge */}
          <span
            className={cn(
              'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full',
              isHighPriority
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                : 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
            )}
          >
            {formatAgentType(question.agentType)}
          </span>

          {/* Contact chip */}
          {question.Contact && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <User size={11} />
              {question.Contact.name}
            </span>
          )}

          {/* Time ago */}
          <span className="ml-auto text-xs text-muted-foreground flex-shrink-0">
            {timeAgo(question.createdAt)}
          </span>
        </div>

        {/* Question text */}
        <div>
          <p
            className={cn(
              'text-sm font-medium leading-snug',
              !expanded && 'line-clamp-3',
            )}
          >
            {question.question}
          </p>
          {/* "Show more" toggle — only rendered when text might overflow */}
          {question.question.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title={expanded ? 'Collapse question text' : 'Expand question text'}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Context */}
        {question.context && (
          <p className={cn('text-xs text-muted-foreground italic leading-snug', !expanded && 'line-clamp-2')}>
            {question.context}
          </p>
        )}
      </div>

      {/* Answer form */}
      <form onSubmit={handleSubmit} className="px-4 pb-4 space-y-2">
        {answeredOk ? (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 py-1">
            <CheckCircle2 size={14} />
            Answered ✓
          </div>
        ) : (
          <>
            <textarea
              rows={3}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Your answer..."
              disabled={submitting}
              className="text-sm w-full border border-border rounded-lg p-2 resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              aria-label="Your answer"
            />
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                title="Submit answer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={13} />
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </form>
    </article>
  );
}

// ─── AgentQuestionsPanel ──────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export function AgentQuestionsPanel() {
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/agent/questions');
        if (res.ok) setQuestions(await res.json());
      } catch {
        // silently fail — panel is not critical path
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  function handleAnswered(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  const visible = showAll ? questions : questions.slice(0, PAGE_SIZE);
  const hiddenCount = questions.length - PAGE_SIZE;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Questions</h2>
            {!loading && questions.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {questions.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">The agent needs your input</p>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="animate-pulse bg-muted rounded-lg h-16" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && questions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
          <HelpCircle size={32} className="text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">No pending questions</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Chippi will ask for guidance when it needs your input.
            </p>
          </div>
        </div>
      )}

      {/* Question cards */}
      {!loading && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map((q) => (
            <QuestionCard key={q.id} question={q} onAnswered={handleAnswered} />
          ))}
        </div>
      )}

      {/* "Show X more" button */}
      {!loading && !showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          title={`Show ${hiddenCount} more question${hiddenCount !== 1 ? 's' : ''}`}
          className="w-full py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg border border-dashed border-border hover:border-border/80 transition-colors"
        >
          Show {hiddenCount} more
        </button>
      )}
    </div>
  );
}
