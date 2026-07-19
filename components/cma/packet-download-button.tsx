'use client';

/**
 * PacketDownloadButton — opens the pre-listing packet export
 * (GET /api/cma/packet/[id]) for a CMA report in a new tab.
 *
 * A plain authed link, not a fetch: the route returns a full HTML document
 * (print-friendly, "Print → Save as PDF" is the export path — see the route's
 * file header), so the browser should navigate to it directly rather than the
 * app trying to intercept and re-render the response.
 */

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PacketDownloadButtonProps {
  slug: string;
  reportId: string;
}

export function PacketDownloadButton({ slug, reportId }: PacketDownloadButtonProps) {
  const href = `/api/cma/packet/${reportId}?slug=${encodeURIComponent(slug)}`;
  return (
    <Button asChild size="sm" variant="outline">
      <a href={href} target="_blank" rel="noopener noreferrer">
        <FileDown aria-hidden size={14} /> Download packet
      </a>
    </Button>
  );
}
