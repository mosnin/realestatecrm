'use client';

import { useState } from 'react';
import { toast } from 'sonner';

export function ClientNotesEditor({
  contactId,
  initialNotes,
}: {
  contactId: string;
  initialNotes: string | null;
}) {
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [saving, setSaving] = useState(false);

  async function saveNotes() {
    try {
      setSaving(true);
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || null }),
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Client note saved');
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Client note</h2>
        <button
          type="button"
          onClick={saveNotes}
          disabled={saving}
          className="inline-flex items-center gap-1.5 text-xs font-medium rounded-md px-3 py-1.5 border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save note'}
        </button>
      </div>
      <div className="px-4 sm:px-6 py-4">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context for your team: objections, motivation, timeline, commitments, and next steps."
          rows={5}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    </div>
  );
}
