'use client';

/**
 * SendForSignatureButton — a reusable button + modal that sends one stored
 * document out for signature via DocuSign.
 *
 * Drop it next to a document (deal documents tab, document row) and pass the
 * document's id; the modal collects the signer's email/name + a subject and
 * POSTs to /api/signatures. The caller embeds it — it isn't wired into any page
 * here.
 *
 * Design: Jobs lens — one action, one modal, calm copy, the canonical Dialog
 * chrome. The trigger defaults to a quiet outline button so it sits beside a
 * document without shouting.
 */

import { useState } from 'react';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toastSuccess, toastError } from '@/lib/toast-helpers';

interface SendForSignatureButtonProps {
  /** The workspace slug — used to authorize the send. */
  slug: string;
  /** The DealDocument id to send. */
  documentId: string;
  /** Optional deal to associate the request with. */
  dealId?: string;
  /** Document label, used to pre-fill the subject. */
  documentLabel?: string;
  /** Pre-fill the signer email (e.g. the deal's primary contact). */
  defaultSignerEmail?: string;
  /** Pre-fill the signer name. */
  defaultSignerName?: string;
  /** Override the trigger button label. */
  triggerLabel?: string;
  /** Trigger button size. Defaults to sm. */
  size?: 'sm' | 'default';
  /** Fired after a successful send. */
  onSent?: () => void;
}

export function SendForSignatureButton({
  slug,
  documentId,
  dealId,
  documentLabel,
  defaultSignerEmail,
  defaultSignerName,
  triggerLabel = 'Send for signature',
  size = 'sm',
  onSent,
}: SendForSignatureButtonProps) {
  const [open, setOpen] = useState(false);
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail ?? '');
  const [signerName, setSignerName] = useState(defaultSignerName ?? '');
  const [subject, setSubject] = useState(
    documentLabel ? `Please sign: ${documentLabel}` : 'Please sign this document',
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSend = async () => {
    const email = signerEmail.trim();
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
          documentId,
          dealId,
          signerEmail: email,
          signerName: signerName.trim() || undefined,
          subject: subject.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toastError(data.error ?? 'Could not send for signature. Try again.');
        return;
      }
      toastSuccess(`Sent for signature — ${email}.`);
      setOpen(false);
      onSent?.();
    } catch {
      toastError('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size={size}>
          <PenLine size={14} strokeWidth={1.75} />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send for signature</DialogTitle>
          <DialogDescription>
            We&apos;ll email the signer a secure link. You&apos;ll see the status here as they sign.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="esign-email">Signer email</Label>
            <Input
              id="esign-email"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="esign-name">Signer name</Label>
            <Input
              id="esign-name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="esign-subject">Subject</Label>
            <Input
              id="esign-subject"
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Please sign this document"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSend} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
