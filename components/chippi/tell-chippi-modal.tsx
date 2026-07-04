'use client';

/**
 * TellChippiModal — "Tell Chippi about someone" quick-capture.
 *
 * The realtor types what they know in plain language; Chippi extracts structured
 * fields (name, email, phone, budget, intent, notes, tags), creates the contact
 * through the real create path (dedupe, scoring, new-lead trigger all intact),
 * and drops the realtor on the new person's page to review and add more.
 *
 * Chippi-branded (the real logo mark + the warm accent), monochrome otherwise,
 * per docs/ui/STYLESHEET.md.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { CHIPPI_PILL, GHOST_PILL } from '@/lib/typography';
import { ChippiLogoMark } from './chippi-logo-mark';

interface TellChippiModalProps {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Phase = 'idle' | 'reading' | 'creating' | 'error';

export function TellChippiModal({ slug, open, onOpenChange }: TellChippiModalProps) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Reset when the modal opens so a re-open is a clean slate.
  useEffect(() => {
    if (open) {
      setText('');
      setPhase('idle');
      setError('');
      // Focus after the dialog's mount animation.
      const t = setTimeout(() => areaRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  const busy = phase === 'reading' || phase === 'creating';

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError('');

    // 1. Chippi reads the text into structured contact fields.
    setPhase('reading');
    let fields: Record<string, unknown>;
    try {
      const res = await fetch('/api/chippi/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Chippi couldn’t read that.');
      fields = data.fields as Record<string, unknown>;
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      return;
    }

    // 2. Create the contact through the real create path (all side effects intact).
    setPhase('creating');
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...fields }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not create the contact.');
      const id: string | undefined = data?.contact?.id ?? data?.id;
      if (!id) throw new Error('Contact created but no id returned.');
      // 3. Land on the new person's page to review and add more.
      onOpenChange(false);
      router.push(`/s/${slug}/contacts/${id}`);
    } catch (e) {
      setPhase('error');
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="space-y-2.5 border-b border-border/60 p-5">
          <div className="flex items-center gap-2.5">
            <ChippiLogoMark size={28} />
            <DialogTitle className="text-base font-semibold text-foreground">
              Tell Chippi about someone
            </DialogTitle>
          </div>
          <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
            Say what you know in plain language. Chippi sorts the name, contact info,
            budget, what they want, and your notes into the right fields — then opens their page.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5">
          <Textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
            disabled={busy}
            rows={5}
            placeholder="Met Sarah Kim at the Oak St open house. Pre-approved for $600k, wants a 3BR with a yard in Riverside, hoping to close by spring. Prefers texting — 555-0142."
            className="resize-none text-sm leading-relaxed"
          />

          {error && (
            <p className="mt-2.5 text-[13px] text-destructive">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          <span className="text-[11px] text-muted-foreground/70">
            {busy
              ? phase === 'reading'
                ? 'Chippi is reading that…'
                : 'Creating the contact…'
              : '⌘↵ to save'}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" className={GHOST_PILL} onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className={CHIPPI_PILL} onClick={() => void submit()} disabled={busy || !text.trim()}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ChippiLogoMark size={16} />}
              {phase === 'creating' ? 'Creating…' : 'Save with Chippi'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
