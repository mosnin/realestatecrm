'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/components/ui/surface-card';
import { SECTION_LABEL, BODY_MUTED } from '@/lib/typography';

/**
 * Admin DSAR export — download a complete copy of a user's workspace to fulfil
 * a data-subject access request. A separate island (not part of user-actions)
 * so it stays self-contained: it hits the capability-gated, audited
 * GET /api/admin/users/[id]/export and streams the JSON blob to the browser.
 */
export function DsarExportButton({ userId, email }: { userId: string; email: string }) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/export`, { method: 'GET' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Couldn't build the DSAR export. Try again in a moment.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? 'chippi-dsar-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('DSAR export downloaded.');
    } catch {
      toast.error('Lost the connection. Check it and try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <p className={cn(SECTION_LABEL, 'mb-2')}>Data subject request</p>
      <div className={cn(SURFACE_CARD, 'px-5 py-4 space-y-3')}>
        <p className={BODY_MUTED}>
          Download a complete copy of this user&apos;s workspace — contacts, deals,
          properties, conversations, and documents — as a single JSON file to fulfil
          a GDPR/CCPA data-subject access request. This is a privileged read and is
          audited against {email}.
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium',
            'border border-border bg-background hover:bg-muted/60 active:scale-[0.98] transition-all duration-150',
            'disabled:opacity-60 disabled:cursor-not-allowed',
          )}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {exporting ? 'Preparing' : 'Export data (DSAR)'}
        </button>
      </div>
    </div>
  );
}
