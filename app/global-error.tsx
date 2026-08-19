'use client';

/**
 * Global error boundary — the last net under the whole App Router tree.
 * Reports the crash to Sentry and renders a calm, on-brand fallback. This
 * only fires for errors that escape every nested error.tsx (i.e. a render
 * crash in the root layout itself), so it ships its own <html>/<body>.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { FONT_SANS_STACK, FONT_SERIF_STACK } from '@/lib/typography';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fff',
          color: '#111',
          fontFamily: FONT_SANS_STACK,
        }}
      >
        <div style={{ textAlign: 'center', padding: '2rem', maxWidth: 420 }}>
          <h1
            style={{
              fontFamily: FONT_SERIF_STACK,
              fontSize: '1.5rem',
              fontWeight: 600,
              margin: '0 0 0.5rem',
            }}
          >
            Something broke.
          </h1>
          <p style={{ color: '#666', fontSize: '0.95rem', margin: '0 0 1.5rem' }}>
            We logged it and we&apos;re on it. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: '1px solid #e5e5e5',
              background: '#111',
              color: '#fff',
              borderRadius: 9999,
              padding: '0.5rem 1.25rem',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
