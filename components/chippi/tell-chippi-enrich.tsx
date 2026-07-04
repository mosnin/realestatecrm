'use client';

/**
 * TellChippiEnrich — "Tell Chippi more" on a person's page.
 *
 * The realtor types anything new about the contact and Chippi decides where it
 * belongs: it appends to the notes, sharpens the intent/preferences, fills blank
 * fields it just learned, and adds tags — never dropping what's already there.
 * On success the page refreshes so the merged fields show immediately, and the
 * enrichment is logged to the contact's timeline.
 *
 * Chippi-branded (real logo mark + warm accent), monochrome otherwise.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { CHIPPI_PILL } from '@/lib/typography';
import { ChippiLogoMark } from './chippi-logo-mark';

export function TellChippiEnrich({ slug, contactId }: { slug: string; contactId: string }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError('');
    setDone(false);
    try {
      const res = await fetch('/api/chippi/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, id: contactId, text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Chippi couldn’t process that.');
      setText('');
      setDone(true);
      router.refresh();
      // Clear the confirmation after a beat.
      setTimeout(() => setDone(false), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center gap-2">
        <ChippiLogoMark size={22} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Tell Chippi more</p>
          <p className="text-[12px] text-muted-foreground">
            Anything new — Chippi files it into the right fields.
          </p>
        </div>
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
        disabled={busy}
        rows={3}
        placeholder="Relocating for a job in March, needs to close before then. Has two dogs, so a yard is a must."
        className="mt-3 resize-none text-sm leading-relaxed"
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground/70">
          {busy ? 'Chippi is updating the record…' : done ? 'Chippi updated the record.' : '⌘↵ to send'}
        </span>
        <button
          type="button"
          className={CHIPPI_PILL}
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ChippiLogoMark size={15} />}
          Tell Chippi
        </button>
      </div>

      {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
    </div>
  );
}
