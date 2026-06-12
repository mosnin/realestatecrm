'use client';

/**
 * MessageActions — the quiet per-message action row (ChatGPT pattern).
 *
 * Assistant messages: Copy (clipboard, swaps to a check) and Speak (POSTs the
 * text to /api/ai/speak, plays the MP3, toggles to Stop while playing).
 * User messages: Edit, which hands the text back to the composer via the
 * existing prefill mechanism so the realtor can tweak and resend.
 *
 * Ghost icon buttons in the chrome size (12px icons), muted until hover;
 * revealed on message hover on pointer devices, always visible on touch.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, PenLine, Square, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.04] hover:text-foreground"
    >
      {children}
    </button>
  );
}

export function MessageActions({
  text,
  onEdit,
  className,
}: {
  /** The message's plain text (concatenated text blocks). */
  text: string;
  /** When set, renders an Edit action (user messages) instead of Copy/Speak. */
  onEdit?: () => void;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [speech, setSpeech] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Stop playback + release the object URL when the message unmounts.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — nothing to recover */
    }
  };

  const stopSpeech = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setSpeech('idle');
  };

  const speak = async () => {
    if (speech === 'playing' || speech === 'loading') {
      stopSpeech();
      return;
    }
    setSpeech('loading');
    try {
      const res = await fetch('/api/ai/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = stopSpeech;
      audio.onerror = stopSpeech;
      await audio.play();
      setSpeech('playing');
    } catch {
      stopSpeech();
    }
  };

  if (!text.trim()) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100',
        className,
      )}
    >
      {onEdit ? (
        <ActionButton label="Edit and resend" onClick={onEdit}>
          <PenLine size={12} />
        </ActionButton>
      ) : (
        <>
          <ActionButton label={copied ? 'Copied' : 'Copy'} onClick={() => void copy()}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </ActionButton>
          <ActionButton
            label={speech === 'idle' ? 'Read aloud' : 'Stop'}
            onClick={() => void speak()}
          >
            {speech === 'loading' ? (
              <Loader2 size={12} className="animate-spin" />
            ) : speech === 'playing' ? (
              <Square size={12} />
            ) : (
              <Volume2 size={12} />
            )}
          </ActionButton>
        </>
      )}
    </div>
  );
}

/** Concatenate a message's text blocks for copy/speak/edit. */
export function textFromBlocks(
  blocks: Array<{ type: string; content?: string }> | null | undefined,
): string {
  if (!blocks) return '';
  return blocks
    .filter((b) => b.type === 'text' && typeof b.content === 'string')
    .map((b) => b.content as string)
    .join('\n\n')
    .trim();
}
