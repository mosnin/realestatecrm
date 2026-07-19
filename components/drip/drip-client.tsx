'use client';

/**
 * Drip sequences hub: list + filter (active/archived), create/edit builder,
 * and an inline per-sequence enrollment view. All mutations hit
 * app/api/drip/** and every list this component renders came from a
 * spaceId-scoped server query (the server page) or a spaceId-scoped API
 * route (client refetches) — nothing here re-derives tenant scope.
 */

import { useMemo, useState } from 'react';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SurfaceCard, SurfaceCardHeader, StatusPill } from '@/components/ui/surface-card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SequenceBuilder, type SequenceFormPayload, type SequenceSubmitResult } from './sequence-builder';
import { EnrollmentPanel } from './enrollment-panel';
import type { DripSequenceUI, EnrollmentCounts } from './types';
import { emptyCounts } from './types';

type Filter = 'active' | 'archived' | 'all';

interface Props {
  slug: string;
  initialSequences: DripSequenceUI[];
  initialCounts: Record<string, EnrollmentCounts>;
}

export function DripClient({ slug, initialSequences, initialCounts }: Props) {
  const [sequences, setSequences] = useState<DripSequenceUI[]>(initialSequences);
  const [counts, setCounts] = useState<Record<string, EnrollmentCounts>>(initialCounts);
  const [filter, setFilter] = useState<Filter>('active');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<DripSequenceUI | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const filtered = useMemo(() => {
    if (filter === 'all') return sequences;
    if (filter === 'active') return sequences.filter((s) => s.active);
    return sequences.filter((s) => !s.active);
  }, [filter, sequences]);

  function openCreate() {
    setEditing(undefined);
    setBuilderOpen(true);
  }
  function openEdit(seq: DripSequenceUI) {
    setEditing(seq);
    setBuilderOpen(true);
  }

  async function handleSubmit(payload: SequenceFormPayload): Promise<SequenceSubmitResult> {
    const isEdit = !!editing;
    const res = await fetch(isEdit ? `/api/drip/sequences/${editing!.id}` : '/api/drip/sequences', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body.error, issues: body.issues };
    }
    if (isEdit) {
      setSequences((prev) => prev.map((s) => (s.id === body.id ? (body as DripSequenceUI) : s)));
      toast.success('Sequence updated.');
    } else {
      setSequences((prev) => [body as DripSequenceUI, ...prev]);
      setCounts((prev) => ({ ...prev, [body.id]: emptyCounts() }));
      toast.success('Sequence created.');
    }
    return { ok: true };
  }

  async function toggleActive(seq: DripSequenceUI) {
    const res = await fetch(`/api/drip/sequences/${seq.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active: !seq.active }),
    });
    if (!res.ok) {
      toast.error('Could not update the sequence.');
      return;
    }
    const updated = (await res.json()) as DripSequenceUI;
    setSequences((prev) => prev.map((s) => (s.id === seq.id ? updated : s)));
  }

  async function handleDelete(seq: DripSequenceUI) {
    const confirmed = await confirm({
      title: `Delete "${seq.name}"?`,
      description: 'This removes the sequence permanently. Sequences with contacts still enrolled can be archived instead.',
      confirmLabel: 'Delete',
      variant: 'destructive',
    });
    if (!confirmed) return;

    const res = await fetch(`/api/drip/sequences/${seq.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? 'Could not delete the sequence.');
      return;
    }
    setSequences((prev) => prev.filter((s) => s.id !== seq.id));
    if (expandedId === seq.id) setExpandedId(null);
    toast.success('Sequence deleted.');
  }

  const filterTabs: Array<{ key: Filter; label: string }> = [
    { key: 'active', label: 'Active' },
    { key: 'archived', label: 'Archived' },
    { key: 'all', label: 'All' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 border-b border-border pb-0">
          {filterTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`relative px-3 py-2 text-sm font-medium transition-colors rounded-t-md ${
                filter === t.key ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
              {filter === t.key && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus size={14} />
          New sequence
        </Button>
      </div>

      {filtered.length === 0 ? (
        <SurfaceCard>
          <SurfaceCardHeader title={sequences.length === 0 ? 'No drip sequences yet' : `No ${filter} sequences`} />
          <p className="mt-3 text-sm text-muted-foreground">
            {sequences.length === 0
              ? 'Create one with a name and a list of timed steps (day offset, channel, instruction), then enroll contacts into it. Nothing is scheduled until a sequence exists and a contact is enrolled.'
              : filter === 'archived'
                ? "Sequences you've paused show up here."
                : 'Nothing matches this filter.'}
          </p>
        </SurfaceCard>
      ) : (
        <div className="space-y-4">
          {filtered.map((seq) => {
            const c = counts[seq.id] ?? emptyCounts();
            const isExpanded = expandedId === seq.id;
            return (
              <SurfaceCard key={seq.id}>
                <SurfaceCardHeader
                  title={seq.name}
                  action={
                    <div className="flex items-center gap-1.5">
                      <StatusPill>{seq.active ? 'active' : 'archived'}</StatusPill>
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Edit sequence" onClick={() => openEdit(seq)}>
                        <Pencil size={14} />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={seq.active ? 'Archive sequence' : 'Reactivate sequence'}
                        onClick={() => toggleActive(seq)}
                      >
                        {seq.active ? <Archive size={14} /> : <ArchiveRestore size={14} />}
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label="Delete sequence"
                        onClick={() => handleDelete(seq)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {seq.steps.length} step{seq.steps.length === 1 ? '' : 's'}
                  {seq.steps.length > 0 && (
                    <>
                      {' — '}
                      {seq.steps.map((s) => `day ${s.dayOffset} (${s.channel})`).join(', ')}
                    </>
                  )}
                </p>
                <div className="mt-4 flex items-center gap-4 text-sm">
                  <span className="text-foreground">{c.enrolled} enrolled</span>
                  <span className="text-muted-foreground">{c.completed} completed</span>
                  <span className="text-muted-foreground">{c.stopped} stopped</span>
                </div>

                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : seq.id)}
                  className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {isExpanded ? 'Hide enrollments' : 'Manage enrollments'}
                </button>

                {isExpanded && (
                  <div className="mt-3">
                    <EnrollmentPanel
                      slug={slug}
                      sequence={seq}
                      onCountsChange={(next) => setCounts((prev) => ({ ...prev, [seq.id]: next }))}
                    />
                  </div>
                )}
              </SurfaceCard>
            );
          })}
        </div>
      )}

      <SequenceBuilder open={builderOpen} onOpenChange={setBuilderOpen} initial={editing} onSubmit={handleSubmit} />
      {ConfirmDialog}
    </div>
  );
}
