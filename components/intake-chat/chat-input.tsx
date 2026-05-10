'use client';

import { useRef, useEffect } from 'react';
import { SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  accentColor?: string; // hex like '#ff964f'
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Type a message…',
  accentColor,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  function send() {
    const el = textareaRef.current;
    if (!el) return;
    const value = el.value.trim();
    if (!value || disabled) return;
    onSend(value);
    el.value = '';
    el.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const sendStyle = accentColor
    ? { backgroundColor: accentColor }
    : undefined;

  return (
    <div
      className={cn(
        'flex items-end gap-2 rounded-xl border border-border/60 bg-background px-4 py-3',
        'focus-within:border-border',
        disabled && 'opacity-60',
      )}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        placeholder={placeholder}
        disabled={disabled}
        onInput={(e) => resize(e.currentTarget)}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex-1 resize-none bg-transparent text-sm text-foreground',
          'placeholder:text-muted-foreground/50 outline-none min-h-[24px]',
          'overflow-y-auto leading-relaxed',
          disabled && 'cursor-not-allowed',
        )}
        style={{ maxHeight: '200px' }}
        aria-label="Chat message"
      />

      <button
        type="button"
        onClick={send}
        disabled={disabled}
        aria-label="Send message"
        className={cn(
          'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center',
          'transition-all duration-150 active:scale-[0.94]',
          disabled
            ? 'bg-foreground/20 text-foreground/30 cursor-not-allowed'
            : 'bg-foreground text-background',
        )}
        style={!disabled && sendStyle ? sendStyle : undefined}
      >
        <SendHorizonal size={14} />
      </button>
    </div>
  );
}
