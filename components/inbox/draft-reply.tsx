'use client';

/**
 * The inline "Draft reply" affordance on a unified-inbox thread. Deliberately a
 * thin wrapper: tapping it mounts the EXISTING MorningActionSheet, which owns
 * the whole compose→preview→send state machine over /api/agent/quick-draft.
 * There is no second drafting engine here — the inbox reuses the same
 * Chippi draft path the /chippi home uses, just seeded with this thread's
 * contact. After a send lands, we refresh so the new outbound message (recorded
 * on the thread by the send path via recordOutboundMessageSafe) appears in the
 * transcript.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MorningActionSheet } from '@/components/chippi/morning-action-sheet';

export function DraftReply({
  slug,
  contactId,
  contactName,
}: {
  slug: string;
  contactId: string;
  contactName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <MorningActionSheet
        slug={slug}
        intent="reach-out"
        context={{ kind: 'person', id: contactId, label: contactName }}
        onSent={() => {
          setOpen(false);
          router.refresh();
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
        'bg-foreground/[0.06] text-foreground/80 transition-colors',
        'hover:bg-foreground/[0.1] hover:text-foreground active:bg-foreground/[0.14]',
      )}
    >
      <PenLine size={14} />
      Draft reply
    </button>
  );
}
