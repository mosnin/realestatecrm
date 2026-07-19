'use client';

/**
 * "Enroll a contact" affordance: search the space's contacts (reusing
 * GET /api/contacts?slug=), pick one, POST /api/drip/enroll. Every search
 * hit is spaceId-scoped by that existing route (requireSpaceOwner(slug)) —
 * this component adds no new contact-reading surface.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ContactHit {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  sequenceId: string;
  sequenceName: string;
  onEnrolled: () => void;
}

export function EnrollContactDialog({ open, onOpenChange, slug, sequenceId, sequenceName, onEnrolled }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/contacts?slug=${encodeURIComponent(slug)}&search=${encodeURIComponent(query)}&limit=20`,
        );
        if (res.ok) {
          const data = (await res.json()) as ContactHit[];
          setResults(Array.isArray(data) ? data : []);
        }
      } catch {
        // Leave the previous results in place rather than flash an error for
        // a transient network hiccup on a debounced search.
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [open, query, slug]);

  async function handleEnroll(contactId: string) {
    setEnrollingId(contactId);
    setError(null);
    try {
      const res = await fetch('/api/drip/enroll', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sequenceId, contactId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? 'Enroll failed.');
        return;
      }
      onEnrolled();
      onOpenChange(false);
    } finally {
      setEnrollingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll a contact</DialogTitle>
          <DialogDescription>Add someone to &ldquo;{sequenceName}&rdquo;.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts by name, email, or phone…"
            autoFocus
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {loading && results.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-1 py-3 text-sm text-muted-foreground">
                {query.trim() ? 'No contacts match that search.' : 'Start typing to find a contact.'}
              </p>
            ) : (
              results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleEnroll(c.id)}
                  disabled={enrollingId !== null}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent/50 disabled:opacity-50"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-foreground">{c.name}</span>
                    {c.email && <span className="ml-1.5 text-muted-foreground">{c.email}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {enrollingId === c.id ? 'Enrolling…' : 'Enroll'}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
