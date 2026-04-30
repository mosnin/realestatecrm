'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, AtSign, X, Loader2, User, Briefcase } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface MentionItem {
  id: string;
  type: 'contact' | 'deal';
  label: string;
  subtitle?: string;
}

interface ChippiPromptBoxProps {
  placeholder?: string;
  onSend?: (message: string, mentions: MentionItem[]) => void;
  onMentionSearch?: (query: string) => Promise<MentionItem[]>;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  autoFocus?: boolean;
}

const MAX_HEIGHT_PX = 240;

export const ChippiPromptBox = React.forwardRef<HTMLTextAreaElement, ChippiPromptBoxProps>(
  function ChippiPromptBox(
    {
      placeholder = 'Message Chippi…',
      onSend,
      onMentionSearch,
      disabled = false,
      isLoading = false,
      className,
      autoFocus = false,
    },
    ref,
  ) {
    const [message, setMessage] = useState('');
    const [mentions, setMentions] = useState<MentionItem[]>([]);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionResults, setMentionResults] = useState<MentionItem[]>([]);
    const [mentionLoading, setMentionLoading] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mentionRef = useRef<HTMLDivElement>(null);

    // Forward textareaRef to parent if it asked for it
    React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement, []);

    const hasContent = message.trim().length > 0;
    const sendDisabled = disabled || isLoading || !hasContent;

    // Auto-resize
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    }, [message]);

    // Optional autoFocus — used when the input becomes visible after a mode switch
    useEffect(() => {
      if (autoFocus) textareaRef.current?.focus();
    }, [autoFocus]);

    // Close mention dropdown on outside click
    useEffect(() => {
      if (!mentionOpen) return;
      const onDown = (e: MouseEvent) => {
        if (!mentionRef.current?.contains(e.target as Node)) setMentionOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [mentionOpen]);

    // Debounced mention search
    const searchMentions = useCallback(
      async (q: string) => {
        if (!onMentionSearch) return;
        setMentionLoading(true);
        try {
          const results = await onMentionSearch(q);
          setMentionResults(results);
          setHighlightedIndex(0);
        } finally {
          setMentionLoading(false);
        }
      },
      [onMentionSearch],
    );

    useEffect(() => {
      if (!mentionOpen) return;
      const t = setTimeout(() => searchMentions(mentionQuery), 180);
      return () => clearTimeout(t);
    }, [mentionQuery, mentionOpen, searchMentions]);

    function handleSubmit() {
      if (sendDisabled) return;
      onSend?.(message.trim(), mentions);
      setMessage('');
      setMentions([]);
    }

    function selectMention(item: MentionItem) {
      if (!mentions.find((m) => m.id === item.id && m.type === item.type)) {
        setMentions((prev) => [...prev, item]);
      }
      setMentionOpen(false);
      setMentionQuery('');
      textareaRef.current?.focus();
    }

    function removeMention(item: MentionItem) {
      setMentions((prev) => prev.filter((m) => !(m.id === item.id && m.type === item.type)));
    }

    function openMention() {
      if (disabled || isLoading) return;
      setMentionOpen(true);
      setMentionQuery('');
      void searchMentions('');
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (mentionOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHighlightedIndex((p) => (p < mentionResults.length - 1 ? p + 1 : 0));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightedIndex((p) => (p > 0 ? p - 1 : mentionResults.length - 1));
          return;
        }
        if (e.key === 'Enter' && mentionResults.length > 0) {
          e.preventDefault();
          selectMention(mentionResults[highlightedIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionOpen(false);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    }

    // Drag/drop text (no file uploads — chat backend doesn't accept files)
    function handleDrop(e: React.DragEvent) {
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        e.preventDefault();
        setMessage((m) => (m ? `${m} ${text}` : text));
        textareaRef.current?.focus();
      }
    }

    return (
      <TooltipProvider>
        <div ref={containerRef} className={cn('relative', className)}>
          <div
            className={cn(
              'rounded-3xl border border-border/70 bg-background',
              'transition-[border-color,box-shadow] duration-150',
              'focus-within:border-foreground/30 focus-within:shadow-[0_1px_0_rgba(0,0,0,0.02)]',
              disabled && 'opacity-60',
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* Mention chips row — collapses when empty */}
            {mentions.length > 0 && (
              <div className="flex flex-wrap gap-1 px-3 pt-2.5">
                {mentions.map((m) => (
                  <span
                    key={`${m.type}-${m.id}`}
                    className="inline-flex items-center gap-1 h-6 pl-1.5 pr-1 rounded-md bg-foreground/[0.04] border border-border/60 text-[12px] text-foreground"
                  >
                    {m.type === 'contact' ? (
                      <User size={11} className="text-muted-foreground" />
                    ) : (
                      <Briefcase size={11} className="text-muted-foreground" />
                    )}
                    <span className="truncate max-w-[180px]">{m.label}</span>
                    <button
                      type="button"
                      onClick={() => removeMention(m)}
                      aria-label={`Remove ${m.label}`}
                      className="inline-flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              spellCheck
              className={cn(
                'w-full resize-none bg-transparent border-0 outline-none',
                'px-4 pt-3 pb-1 text-[14px] leading-relaxed text-foreground',
                'placeholder:text-muted-foreground/60',
                'disabled:cursor-not-allowed',
              )}
              style={{ maxHeight: MAX_HEIGHT_PX }}
            />

            {/* Action row */}
            <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={openMention}
                      disabled={disabled || isLoading}
                      aria-label="Mention a contact or deal"
                      className={cn(
                        'inline-flex items-center justify-center w-8 h-8 rounded-full',
                        'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                        'transition-colors duration-150',
                        'disabled:opacity-40 disabled:cursor-not-allowed',
                        mentionOpen && 'bg-foreground/[0.045] text-foreground',
                      )}
                    >
                      <AtSign size={15} strokeWidth={1.75} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={6}>
                    Mention a contact or deal
                  </TooltipContent>
                </Tooltip>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={sendDisabled}
                    aria-label={isLoading ? 'Chippi is responding' : 'Send'}
                    className={cn(
                      'inline-flex items-center justify-center w-8 h-8 rounded-full',
                      'transition-all duration-150 active:scale-[0.96]',
                      hasContent && !isLoading
                        ? 'bg-foreground text-background hover:bg-foreground/90'
                        : 'bg-foreground/[0.06] text-muted-foreground/60',
                      sendDisabled && 'cursor-not-allowed',
                    )}
                  >
                    {isLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ArrowUp size={15} strokeWidth={2.25} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  {isLoading ? 'Responding…' : 'Send · Enter'}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Mention dropdown — quiet popover anchored above the input */}
          {mentionOpen && (
            <div
              ref={mentionRef}
              role="listbox"
              aria-label="Mention suggestions"
              className={cn(
                'absolute left-0 right-0 bottom-full mb-2 z-30',
                'rounded-xl border border-border/70 bg-popover shadow-lg shadow-foreground/5',
                'max-h-[280px] overflow-y-auto',
              )}
            >
              <div className="px-3 pt-2.5 pb-1.5 flex items-center gap-2 border-b border-border/60">
                <AtSign size={12} className="text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={mentionQuery}
                  onChange={(e) => setMentionQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionOpen(false);
                      textareaRef.current?.focus();
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setHighlightedIndex((p) =>
                        p < mentionResults.length - 1 ? p + 1 : 0,
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIndex((p) =>
                        p > 0 ? p - 1 : mentionResults.length - 1,
                      );
                    } else if (e.key === 'Enter' && mentionResults.length > 0) {
                      e.preventDefault();
                      selectMention(mentionResults[highlightedIndex]);
                    }
                  }}
                  placeholder="Search contacts and deals…"
                  className="flex-1 text-[12px] bg-transparent border-0 outline-none placeholder:text-muted-foreground/60 text-foreground"
                />
                {mentionLoading && (
                  <Loader2 size={12} className="text-muted-foreground animate-spin" />
                )}
              </div>
              <div className="py-1">
                {mentionResults.length === 0 && !mentionLoading ? (
                  <p className="px-3 py-2.5 text-[12px] text-muted-foreground/70">
                    No matches.
                  </p>
                ) : (
                  mentionResults.map((item, i) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={i === highlightedIndex}
                      onClick={() => selectMention(item)}
                      onMouseEnter={() => setHighlightedIndex(i)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-1.5 text-left',
                        'transition-colors duration-100',
                        i === highlightedIndex
                          ? 'bg-foreground/[0.04]'
                          : 'hover:bg-foreground/[0.025]',
                      )}
                    >
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-foreground/[0.05] text-muted-foreground flex-shrink-0">
                        {item.type === 'contact' ? (
                          <User size={11} />
                        ) : (
                          <Briefcase size={11} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-foreground truncate leading-tight">
                          {item.label}
                        </p>
                        {item.subtitle && (
                          <p className="text-[11px] text-muted-foreground/80 truncate leading-tight mt-0.5">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </TooltipProvider>
    );
  },
);
