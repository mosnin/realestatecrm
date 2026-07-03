'use client';

/**
 * Duplicates review surface — a dialog reachable from the People toolbar.
 *
 * Flow per group:
 *   1. Scan: GET /api/contacts/duplicates?slug=… returns candidate groups.
 *   2. Review: the realtor picks the SURVIVOR (the record to keep); the rest
 *      are the duplicates. Oldest is pre-selected as survivor.
 *   3. Preview: POST /api/contacts/merge { commit:false } shows the merged
 *      result (tag union, filled blanks) + how many references re-point.
 *   4. Confirm: POST /api/contacts/merge { commit:true } runs the transactional
 *      merge. On success the group is removed and onMerged() refreshes the list.
 *
 * Preview-before-commit: the destructive commit button is only enabled after a
 * preview has loaded for that group, so nothing is ever merged unseen.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Users, Mail, Phone, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countLabel } from '@/lib/formatting';
import { toast } from 'sonner';

type DedupConfidence = 'high' | 'medium' | 'low';

type GroupContact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  type?: string;
  tags?: string[] | null;
  leadScore?: number | null;
  budget?: number | null;
  createdAt?: string | null;
};

type DuplicateGroup = {
  key: string;
  contacts: GroupContact[];
  confidence: DedupConfidence;
  reasons: string[];
};

type MergePreview = {
  merged: { tags?: string[]; email?: string | null; phone?: string | null };
  changes: Record<string, { from: unknown; to: unknown }>;
  references: Record<string, number>;
};

const CONFIDENCE_LABEL: Record<DedupConfidence, string> = {
  high: 'High confidence',
  medium: 'Likely',
  low: 'Possible',
};

export function DuplicatesPanel({
  slug,
  open,
  onClose,
  onMerged,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Per-group state, keyed by group.key.
  const [survivorByGroup, setSurvivorByGroup] = useState<Record<string, string>>({});
  const [previewByGroup, setPreviewByGroup] = useState<Record<string, MergePreview>>({});
  const [busyGroup, setBusyGroup] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contacts/duplicates?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Scan failed');
      const data = (await res.json()) as { groups: DuplicateGroup[]; scanned: number };
      setGroups(data.groups ?? []);
      setScanned(data.scanned ?? 0);
      // Default survivor = first member (oldest, per the API ordering).
      const defaults: Record<string, string> = {};
      for (const g of data.groups ?? []) defaults[g.key] = g.contacts[0]?.id;
      setSurvivorByGroup(defaults);
      setPreviewByGroup({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scan for duplicates');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (open) scan();
  }, [open, scan]);

  function pickSurvivor(groupKey: string, contactId: string) {
    setSurvivorByGroup((prev) => ({ ...prev, [groupKey]: contactId }));
    // Survivor changed → invalidate any stale preview for this group.
    setPreviewByGroup((prev) => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
  }

  function dupIdsFor(group: DuplicateGroup): string[] {
    const survivorId = survivorByGroup[group.key];
    return group.contacts.filter((c) => c.id !== survivorId).map((c) => c.id);
  }

  async function preview(group: DuplicateGroup) {
    const survivorId = survivorByGroup[group.key];
    if (!survivorId) return;
    setBusyGroup(group.key);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, survivorId, duplicateIds: dupIdsFor(group), commit: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Preview failed');
      setPreviewByGroup((prev) => ({ ...prev, [group.key]: data as MergePreview }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not preview merge');
    } finally {
      setBusyGroup(null);
    }
  }

  async function commit(group: DuplicateGroup) {
    const survivorId = survivorByGroup[group.key];
    if (!survivorId) return;
    setBusyGroup(group.key);
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, survivorId, duplicateIds: dupIdsFor(group), commit: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Merge failed');
      const mergedCount = Array.isArray(data?.merged) ? data.merged.length : 0;
      toast.success(
        mergedCount > 0
          ? `Merged ${countLabel(mergedCount, 'duplicate')}.`
          : 'Already merged.',
      );
      // Drop the group from the list; keep the dialog open for the rest.
      setGroups((prev) => prev.filter((g) => g.key !== group.key));
      onMerged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not merge');
    } finally {
      setBusyGroup(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users size={16} />
            Duplicate contacts
          </DialogTitle>
          <DialogDescription>
            Review likely duplicates and merge them. The record you keep wins on
            conflicts; blank fields are filled from the duplicate, and tags are
            combined. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            <span className="ml-2 text-sm">Scanning {scanned ? `${scanned} contacts` : 'contacts'}…</span>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle size={16} />
            {error}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <p className="text-sm">No duplicates found{scanned ? ` across ${scanned} contacts` : ''}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const survivorId = survivorByGroup[group.key];
              const prev = previewByGroup[group.key];
              const isBusy = busyGroup === group.key;
              const refTotal = prev
                ? Object.values(prev.references).reduce((a, b) => a + b, 0)
                : 0;
              return (
                <div key={group.key} className="rounded-lg border border-border/70 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={group.confidence === 'high' ? 'default' : 'secondary'}>
                        {CONFIDENCE_LABEL[group.confidence]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{group.reasons.join(' · ')}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{group.contacts.length} records</span>
                  </div>

                  <div className="space-y-1.5">
                    {group.contacts.map((c) => {
                      const isSurvivor = c.id === survivorId;
                      return (
                        <label
                          key={c.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors',
                            isSurvivor
                              ? 'border-foreground/40 bg-foreground/[0.04]'
                              : 'border-border/50 hover:bg-foreground/[0.02]',
                          )}
                        >
                          <input
                            type="radio"
                            name={`survivor-${group.key}`}
                            checked={isSurvivor}
                            onChange={() => pickSurvivor(group.key, c.id)}
                            className="accent-foreground"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{c.name || 'Unnamed'}</span>
                              {isSurvivor && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/60">
                                  Keep
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                              {c.email && (
                                <span className="inline-flex items-center gap-1">
                                  <Mail size={11} />
                                  {c.email}
                                </span>
                              )}
                              {c.phone && (
                                <span className="inline-flex items-center gap-1">
                                  <Phone size={11} />
                                  {c.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {prev && (
                    <div className="mt-2.5 rounded-md bg-muted/40 p-2.5 text-xs">
                      <p className="mb-1 font-medium text-foreground/80">After merge, the kept record will have:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(prev.merged.tags ?? []).map((t) => (
                          <Badge key={t} variant="outline" className="text-[10px]">
                            {t}
                          </Badge>
                        ))}
                      </div>
                      {refTotal > 0 && (
                        <p className="mt-1.5 text-muted-foreground">
                          {countLabel(refTotal, 'linked record')} (deals, activity, tours,
                          documents…) will move to the kept contact.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={isBusy}
                      onClick={() => preview(group)}
                    >
                      {isBusy && !prev ? <Loader2 className="animate-spin" size={13} /> : 'Preview'}
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      // Preview-before-commit: must preview this group first.
                      disabled={isBusy || !prev}
                      onClick={() => commit(group)}
                    >
                      {isBusy && prev ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <>
                          Merge <ArrowRight size={13} />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
