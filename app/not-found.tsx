'use client';

import Link from 'next/link';
import { rootDomain, protocol } from '@/lib/utils';
import { PixelCanvas } from '@/components/ui/pixel-canvas';

/**
 * 404 — a small delight instead of a dead end. PixelCanvas paints a trailing
 * pixel field in the brand gradient hues wherever the cursor moves (its
 * listeners live on the wrapping container, so the link stays clickable and
 * the whole viewport is the play surface). Content sits above the canvas.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      <PixelCanvas
        className="absolute inset-0"
        gap={7}
        speed={0.03}
        colors={['#ff7a45', '#ff5fa2', '#c77dff']}
      />
      <div className="relative z-10 text-center">
        <p
          style={{ fontFamily: 'var(--font-mono)' }}
          className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
        >
          404
        </p>
        <h1 className="font-title mt-3 text-4xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <div className="mt-6">
          <Link
            href={`${protocol}://${rootDomain}`}
            className="rounded-full bg-primary text-primary-foreground px-6 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Go to {rootDomain}
          </Link>
        </div>
      </div>
    </div>
  );
}
