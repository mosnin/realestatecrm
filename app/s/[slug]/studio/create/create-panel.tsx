'use client';

/**
 * CreatePanel — the interactive surface of /s/[slug]/studio/create.
 *
 * Prompt in, image out. The result is stored server-side as a File row, so it
 * lands in the realtor's Files library, and generation cost is metered into
 * usage by the API route. This surface stays about the creative output.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImagePlus, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { CAPTION } from '@/lib/typography';
import { DURATION_BASE, EASE_OUT } from '@/lib/motion';
import { STUDIO_MODELS, DEFAULT_IMAGE_MODEL } from '@/lib/studio/models';

interface GenerateResult {
  url: string;
  fileId: string;
  kind: 'image' | 'video';
}

export function CreatePanel() {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = prompt.trim().length > 0 && !generating;

  async function handleGenerate() {
    if (prompt.trim().length === 0 || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        fileId?: string;
        kind?: string;
        error?: string;
      };
      if (!res.ok || !body.url || !body.fileId) {
        throw new Error(body.error || 'Generation failed. Please try again.');
      }
      setResult({
        url: body.url,
        fileId: body.fileId,
        kind: body.kind === 'video' ? 'video' : 'image',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Prompt */}
      <div className="space-y-2.5">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          placeholder="Describe the image — a listing hero shot, a branded quote card, a neighborhood scene…"
          aria-label="Describe the image you want"
          maxLength={2000}
          disabled={generating}
          className="min-h-[112px] resize-none"
        />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            {Object.entries(STUDIO_MODELS).map(([slug, m]) => {
              const active = slug === model;
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() => setModel(slug)}
                  disabled={generating}
                  className={cn(
                    'rounded-full px-3 h-8 text-[12.5px] font-medium transition-colors disabled:opacity-50',
                    active
                      ? 'bg-foreground text-background'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <Button onClick={() => void handleGenerate()} disabled={!canGenerate}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/5 px-3 py-2 flex items-start gap-2 text-[12.5px] text-rose-700 dark:text-rose-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-rose-700/70 dark:text-rose-400/70 hover:text-rose-700 dark:hover:text-rose-400"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Result */}
      {generating ? (
        <div className="rounded-xl border border-border/60 bg-muted/30 aspect-[4/3] flex flex-col items-center justify-center gap-1.5 animate-pulse">
          <p className="text-sm text-foreground">
            {STUDIO_MODELS[model]?.kind === 'video'
              ? 'Generating your video.'
              : 'Generating your image.'}
          </p>
          <p className={CAPTION}>
            {STUDIO_MODELS[model]?.kind === 'video'
              ? 'Video can take a few minutes — keep this tab open.'
              : 'This usually takes a few seconds.'}
          </p>
        </div>
      ) : result ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION_BASE, ease: EASE_OUT }}
          className="space-y-2"
        >
          {result.kind === 'video' ? (
            <video
              src={result.url}
              controls
              className="w-full rounded-xl border border-border/60"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.url}
              alt={prompt || 'Generated image'}
              className="w-full rounded-xl border border-border/60"
            />
          )}
          <p className={CAPTION}>Saved to your files.</p>
        </motion.div>
      ) : (
        <EmptyState
          icon={ImagePlus}
          title="Your image will appear here."
          description="Write a prompt above and Studio will generate it."
        />
      )}
    </div>
  );
}
