'use client';

/**
 * /s/[slug]/signatures — Send for signature.
 *
 * One intent: a realtor sends a stored document out for signature, then watches
 * it move from sent to delivered to signed. The list is the focal element — it's
 * the realtor's at-a-glance read of what's out for signature and what's done.
 * The send form sits above it; the primary send path is the per-document button
 * embedded on the deal documents tab, so the form here takes a document id for
 * the manual case.
 *
 * Design: Jobs lens — paper-flat, serif h1 + status sentence, hairline-divided
 * request list, status pills from the canonical palette, calm copy.
 */

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StaggerList, StaggerItem } from '@/components/motion/stagger-list';
import { toastSuccess, toastError } from '@/lib/toast-helpers';
import { cn } from '@/lib/utils';
import {
  H1,
  TITLE_FONT,
  BODY,
  BODY_MUTED,
  SECTION_LABEL,
  CAPTION,
  META,
} from '@/lib/typography';

// ── Types ─────────────────────────────────────────────────────────────────────

type RequestStatus =
  | 'created'
  | 'sent'
  | 'delivered'
  | 'completed'
  | 'declined'
  | 'voided';

interface SignatureRequest {
  id: string;
  documentId: string | null;
  envelopeId: string | null;
  subject: string;
  signerEmail: string;
  signerName: string | null;
  status: RequestStatus;
  signedDocumentUrl: string | null;
  completedAt: string | null;
  createdAt: string;
}

// Status pill tones — the canonical status palette from STYLESHEET.md.
const STATUS_STYLES: Record<RequestStatus, string> = {
  created: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  sent: 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
  delivered: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/15',
  completed: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15',
  declined: 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15',
  voided: 'text-muted-foreground bg-muted',
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  created: 'Created',
  sent: 'Sent',
  delivered: 'Delivered',
  completed: 'Signed',
  declined: 'Declined',
  voided: 'Voided',
};

const SUBJECT_MAX = 200;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Main view ────────────────────────────────────────────────────────────────

export function SignaturesView({ slug }: { slug: string }) {
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [documentId, setDocumentId] = useState('');
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [subject, setSubject] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/signatures?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        setRequests([]);
        return;
      }
      const data = (await res.json()) as { requests?: SignatureRequest[] };
      setRequests(data.requests ?? []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleSend = async () => {
    const doc = documentId.trim();
    const email = signerEmail.trim();
    if (!doc) {
      toastError('Add a document id.');
      return;
    }
    if (!email) {
      toastError("Add the signer's email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          documentId: doc,
          signerEmail: email,
          signerName: signerName.trim() || undefined,
          subject: subject.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { request?: SignatureRequest; error?: string };
      if (!res.ok || !data.request) {
        toastError(data.error ?? 'Could not send for signature. Try again.');
        return;
      }
      setRequests((prev) => [data.request as SignatureRequest, ...prev]);
      setDocumentId('');
      setSignerEmail('');
      setSignerName('');
      setSubject('');
      toastSuccess(`Sent for signature — ${email}.`);
    } catch {
      toastError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (id: string) => {
    try {
      const res = await fetch(`/api/signatures/${id}?slug=${encodeURIComponent(slug)}`);
      const data = (await res.json()) as { signedDownloadUrl?: string | null };
      if (data.signedDownloadUrl) {
        window.open(data.signedDownloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        toastError('The signed document is not ready yet.');
      }
    } catch {
      toastError('Could not open the signed document.');
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 pb-12 space-y-12">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="space-y-1.5">
        <p className={cn(BODY_MUTED)}>Signatures.</p>
        <h1 className={cn(H1)} style={TITLE_FONT}>
          Send for signature.
        </h1>
        <p className={cn(BODY_MUTED)}>
          Send a stored document to a signer and track it through to signed.
        </p>
      </header>

      {/* ── Send form ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/70 bg-card px-5 py-5 space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="sig-document" className="text-sm font-medium text-foreground">
            Document id
          </label>
          <Input
            id="sig-document"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="The document to send"
          />
          <p className={cn(CAPTION)}>
            Sending from a deal? Use the &quot;Send for signature&quot; button on the document
            instead &mdash; it fills this in for you.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sig-email" className="text-sm font-medium text-foreground">
            Signer email
          </label>
          <Input
            id="sig-email"
            type="email"
            value={signerEmail}
            onChange={(e) => setSignerEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sig-name" className="text-sm font-medium text-foreground">
            Signer name
          </label>
          <Input
            id="sig-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="sig-subject" className="text-sm font-medium text-foreground">
            Subject
          </label>
          <Input
            id="sig-subject"
            value={subject}
            maxLength={SUBJECT_MAX}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Please sign this document"
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSend} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send for signature'}
          </Button>
        </div>
      </div>

      {/* ── Requests ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <p className={cn(SECTION_LABEL)}>Sent for signature</p>

        {loading ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className={cn(BODY, 'text-muted-foreground')}>Loading&hellip;</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
            <p className={cn(BODY)}>Nothing out for signature.</p>
            <p className={cn(CAPTION, 'mt-1')}>
              Anything you send will show up here with its status.
            </p>
          </div>
        ) : (
          <StaggerList key={requests.length} className="divide-y divide-border/60">
            {requests.map((r) => (
              <StaggerItem key={r.id}>
                <div className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className={cn(BODY, 'font-medium truncate')}>{r.subject}</p>
                    <p className={cn(CAPTION, 'truncate mt-0.5')}>
                      {r.signerName ? `${r.signerName} · ` : ''}
                      {r.signerEmail}
                    </p>
                    <p className={cn(META, 'mt-1')}>
                      {r.status === 'completed' && r.completedAt
                        ? `Signed ${formatDate(r.completedAt)}`
                        : `Sent ${formatDate(r.createdAt)}`}
                    </p>
                    {r.status === 'completed' && r.signedDocumentUrl && (
                      <button
                        type="button"
                        onClick={() => handleDownload(r.id)}
                        className={cn(
                          CAPTION,
                          'mt-1 inline-flex items-center gap-1 text-foreground hover:underline',
                        )}
                      >
                        <ExternalLink size={12} strokeWidth={1.75} />
                        Open signed document
                      </button>
                    )}
                  </div>
                  <span
                    className={cn(
                      'inline-flex shrink-0 text-xs font-medium rounded-full px-2.5 py-0.5',
                      STATUS_STYLES[r.status],
                    )}
                  >
                    {STATUS_LABELS[r.status]}
                  </span>
                </div>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </section>
    </main>
  );
}
