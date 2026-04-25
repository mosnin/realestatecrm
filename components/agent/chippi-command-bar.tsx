'use client';

import { useState, useRef } from 'react';
import { Send, Loader2, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChippiCommandBarProps {
  slug: string;
  onRunStarted?: (runId: string) => void;
  className?: string;
}

const QUICK_COMMANDS = [
  'Focus on buyers today',
  'Check stalled deals',
  'Draft follow-ups for hot leads',
  'Review overdue follow-ups',
];

export function ChippiCommandBar({ slug: _slug, onRunStarted, className }: ChippiCommandBarProps) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastDirective, setLastDirective] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function handleSend() {
    const directive = input.trim();
    if (!directive || sending) return;
    setSending(true);
    try {
      // Store directive as priority memory, then trigger run
      await fetch('/api/agent/directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directive }),
      });
      // Trigger run-now
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      if (res.ok) {
        setLastDirective(directive);
        setInput('');
        // The run-now response doesn't include runId, so we signal the parent to watch for new activity
        onRunStarted?.('latest');
      }
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className={cn('border-t border-border bg-card', className)}>
      {/* Quick commands */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1 overflow-x-auto scrollbar-none">
        <span className="text-[11px] text-muted-foreground flex-shrink-0">Quick:</span>
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
            className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-border hover:border-orange-500/40 hover:bg-orange-500/5 hover:text-orange-600 dark:hover:text-orange-400 transition-colors text-muted-foreground whitespace-nowrap"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2 px-4 pb-4 pt-2">
        <div className="w-6 h-6 rounded-md bg-orange-500 flex items-center justify-center flex-shrink-0 mb-1">
          <Bot size={12} className="text-white" />
        </div>
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell Chippi what to focus on... (↵ to run)"
            rows={1}
            className={cn(
              'w-full resize-none rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm',
              'placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500/50',
              'transition-colors',
            )}
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
        </div>
        <button
          onClick={() => void handleSend()}
          disabled={!input.trim() || sending}
          className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all mb-0.5',
            input.trim() && !sending
              ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-sm'
              : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
        >
          {sending
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />}
        </button>
      </div>

      {lastDirective && (
        <div className="px-4 pb-3 -mt-1">
          <p className="text-[11px] text-muted-foreground font-mono">
            <span className="text-orange-500">✓</span> Directive sent: &quot;{lastDirective.slice(0, 60)}{lastDirective.length > 60 ? '...' : ''}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
