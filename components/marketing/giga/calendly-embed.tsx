'use client';

/**
 * CalendlyEmbed, the inline Calendly scheduler used on /demo.
 *
 * Renders the inline-widget div and loads Calendly's widget.js, which
 * auto-initializes any `.calendly-inline-widget` already in the DOM. The
 * primary_color matches the Chippi accent. Calendly domains are allowlisted in
 * the CSP (next.config.ts).
 */

import Script from 'next/script';

export function CalendlyEmbed({
  url = 'https://calendly.com/trychippi/demo?primary_color=ff7d31',
}: {
  url?: string;
}) {
  return (
    <>
      <div className="calendly-inline-widget" data-url={url} style={{ minWidth: 320, height: 700 }} />
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
    </>
  );
}
