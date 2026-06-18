'use client';

/**
 * Renders a `display: 'message-draft'` tool result as the tool-ui
 * MessageDraft — an email draft awaiting the realtor's approval, with Send
 * and Cancel inline.
 *
 * Two wiring modes, picked by whether the tool result carried a `draftId`:
 *
 *   1. REAL ACTION (preferred) — `draft_message` persisted an AgentDraft row
 *      and returned its id. Send → PATCH /api/agent/drafts/{id} {status:
 *      'approved'} (the same endpoint the approvals inbox uses, which runs
 *      delivery via lib/delivery.sendDraft). Cancel → PATCH {status:
 *      'dismissed'}. No new endpoint, no permission bypass — this is the
 *      realtor's existing approve/discard path, surfaced inline in chat.
 *
 *   2. INTENT FALLBACK — no `draftId` (e.g. the compose-only `draft_email`
 *      tool, which never writes an AgentDraft). Send/Cancel route through
 *      `onUserIntent` with an explicit instruction so the agent can take it
 *      from there.
 *
 * After a successful send we flip the card to `outcome: 'sent'` so it shows
 * the receipt (sent-at + check) instead of live buttons. The MessageDraft
 * component owns the brief undo grace period; `onSend` fires after it elapses.
 *
 * Read-only history surfaces: if the draft already has an `outcome` it renders
 * as a receipt; otherwise (no handlers wired) the buttons are present but the
 * card is a faithful snapshot of what was drafted.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { MessageDraft } from '@/components/tool-ui/message-draft';
import {
  safeParseSerializableMessageDraft,
  type MessageDraftOutcome,
} from '@/components/tool-ui/message-draft/schema';
import { buildEmailDraft, type EmailDraftInput } from './tool-ui-mappers';

export interface MessageDraftData extends EmailDraftInput {
  /** AgentDraft row id. Present → real approve/discard; absent → intent fallback. */
  draftId?: string | null;
}

export function MessageDraftResult({
  data,
  onUserIntent,
}: {
  data: MessageDraftData;
  onUserIntent?: (text: string) => void;
}) {
  // Local outcome override so the card flips to the receipt after a real send
  // without waiting on a server round-trip / reload.
  const [outcome, setOutcome] = useState<MessageDraftOutcome | undefined>(
    data.outcome ?? undefined,
  );

  const draftId = data.draftId ?? null;
  const toLine = data.to?.filter(Boolean).join(', ') || 'the recipient';

  const payload = buildEmailDraft({ ...data, outcome });
  const parsed = safeParseSerializableMessageDraft(payload);
  if (!parsed) return null;

  // ── Real approve-and-send via the existing draft endpoint ────────────────
  async function approveAndSend() {
    if (!draftId) {
      onUserIntent?.(`Approve and send the drafted email to ${toLine}.`);
      return;
    }
    try {
      const res = await fetch(`/api/agent/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't send that draft. Try again from your inbox.");
        // Leave the card in review state so the realtor can retry.
        setOutcome(undefined);
        return;
      }
      toast.success('Sent.');
    } catch {
      toast.error("Couldn't reach the server. The draft is safe in your inbox.");
      setOutcome(undefined);
    }
  }

  // ── Real discard via the existing draft endpoint ─────────────────────────
  async function discard() {
    if (!draftId) {
      onUserIntent?.(`Discard the drafted email to ${toLine}.`);
      return;
    }
    try {
      const res = await fetch(`/api/agent/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Couldn't discard that draft.");
      }
    } catch {
      toast.error("Couldn't reach the server.");
    }
  }

  // Already settled (history / post-send) — render the receipt, no handlers.
  const settled = Boolean(outcome);

  return (
    <div className="mt-2">
      <MessageDraft
        {...parsed}
        onSend={
          settled
            ? undefined
            : async () => {
                setOutcome('sent');
                await approveAndSend();
              }
        }
        onCancel={settled ? undefined : () => void discard()}
      />
    </div>
  );
}
