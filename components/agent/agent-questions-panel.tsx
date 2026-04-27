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

function formatAgentType(raw: string): string {
  return raw.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ─── QuestionCard ──────────────────────────────────────────────────────────────

function QuestionCard({ question, onAnswered }: { question: AgentQuestion; onAnswered: (id: string) => void }) {
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
    if (!trimmed) { setError('Please write an answer'); return; }
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
        'border-l-2 transition-opacity duration-300',
        fading && 'opacity-0',
        isHighPriority ? 'border-l-amber-500' : 'border-l-blue-400',
      )}
    >
      <div className="px-5 pt-4 pb-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            'inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full',
            isHighPriority
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
              : 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
          )}>
            {formatAgentType(question.agentType)}
          </span>
          {question.Contact && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <User size={11} />
              {question.Contact.name}
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground flex-shrink-0">
            {timeAgo(question.createdAt)}
          </span>
        </div>

        <div>
          <p className={cn('text-sm font-medium leading-snug', !expanded && 'line-clamp-3')}>
            {question.question}
          </p>
          {question.question.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {question.context && (
          <p className={cn('text-xs text-muted-foreground italic leading-snug', !expanded && 'line-clamp-2')}>
            {question.context}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-5 pb-4 space-y-2">
        {answeredOk ? (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 py-1">
            <CheckCircle2 size={14} />
            Answered ✓
          </div>
        ) : (
          <>
            <textarea
              rows={2}
              value={answer}
              onChange={(e) => { setAnswer(e.target.value); if (error) setError(null); }}
              placeholder="Your answer..."
              disabled={submitting}
              className="text-sm w-full border border-border rounded-lg p-2.5 resize-none bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              aria-label="Your answer"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !answer.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={12} />
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
        // non-critical
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
    <section className="rounded-2xl border bg-card overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-border/60">
        <HelpCircle size={14} className="text-amber-500 flex-shrink-0" />
        <h2 className="text-sm font-semibold">Questions</h2>
        {!loading && questions.length > 0 && (
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white min-w-[20px] text-center">
            {questions.length}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="px-5 py-5 space-y-3">
          {[1, 2].map((n) => (
            <div key={n} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && questions.length === 0 && (
        <div className="flex items-center gap-3.5 px-5 py-8">
          <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-muted-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No pending questions</p>
            <p className="text-xs text-muted-foreground mt-0.5">Chippi will ask for your input here when it needs guidance.</p>
          </div>
        </div>
      )}

      {/* Question rows */}
      {!loading && visible.length > 0 && (
        <div className="divide-y divide-border/40">
          {visible.map((q) => (
            <QuestionCard key={q.id} question={q} onAnswered={handleAnswered} />
          ))}
        </div>
      )}

      {/* Show more */}
      {!loading && !showAll && hiddenCount > 0 && (
        <div className="px-5 py-3 border-t border-border/40">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Show {hiddenCount} more question{hiddenCount !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </section>
  );
}
