'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SharePageClientProps {
  intakeUrl: string;
  slug: string;
  embedMode?: boolean;
}

export function SharePageClient({ intakeUrl, slug, embedMode }: SharePageClientProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const textToCopy = embedMode
      ? `<iframe src="${intakeUrl}" width="100%" height="800" frameborder="0" style="border:none; border-radius:12px;"></iframe>`
      : intakeUrl;

    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="gap-1.5"
      >
        {copied ? (
          <>
            <Check size={14} className="text-green-600" />
            <span className="text-green-700 dark:text-green-400">Copied!</span>
          </>
        ) : (
          <>
            <Copy size={14} />
            {embedMode ? 'Copy embed code' : 'Copy link'}
          </>
        )}
      </Button>
      {!embedMode && (
        <a
          href={`/apply/${slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-2"
        >
          Preview form
        </a>
      )}
    </div>
  );
}
