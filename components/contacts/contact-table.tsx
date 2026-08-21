'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactForm } from './contact-form';
import {
  Search,
  Trash2,
  Pencil,
  Phone,
  Mail,
  X,
  MoreHorizontal,
  Mic,
  ChevronRight,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/sharkui/context-menu';
import {
  BODY_MUTED,
  CHIPPI_PILL,
  H1,
  PRIMARY_PILL,
  QUIET_LINK,
  SECTION_LABEL,
  TITLE_FONT,
} from '@/lib/typography';
import { DASHBOARD_SURFACE } from '@/components/ui/surface-card';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApplicationCompare } from './application-compare';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';
import type { SavedView } from '@/lib/types';
import { countLabel } from '@/lib/formatting';
import { CONTACT_STAGES } from '@/lib/constants';
import { CsvImportModal } from './csv-import-modal';
import { DuplicatesPanel } from './duplicates-panel';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { contactEditorDefaults } from '@/lib/contact-form-state';
import { motion } from 'framer-motion';
import { EASE_APPLE, DURATION_FAST } from '@/lib/motion';
import { AnimatedNumber, Reveal, SplitReveal } from '@/components/motion';

type Client = {
  id: string;
  name: string;
  type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  phone: string | null;
  email: string | null;
  budget: number | null;
  preferences: string | null;
  properties: string[];
  createdAt: string;
  address: string | null;
  notes: string | null;
  tags: string[];
  followUpAt: string | null;
  leadType: 'rental' | 'buyer';
  leadScore: number | null;
};

const STAGES = CONTACT_STAGES;

/**
 * Lead-score → tier. Thresholds mirror lib/dynamic-lead-scoring.ts
 * (>=75 hot, >=45 warm, else cold). Null/unscored returns null so the row
 * renders nothing rather than a misleading zero.
 */
function scoreTier(score: number | null): string | null {
  if (score == null || score <= 0) return null;
  if (score >= 75) return 'Hot';
  if (score >= 45) return 'Warm';
  return 'Cold';
}

/**
 * Lead-score label — the tier and score, scannable without decorative color.
 */
function ScoreChip({ score }: { score: number | null }) {
  const tier = scoreTier(score);
  if (!tier) return null;
  return (
    <span
      className="inline-flex flex-shrink-0 items-baseline gap-1 text-[11px] text-muted-foreground"
      title={`${tier} lead · score ${score}`}
    >
      <span>{tier}</span>
      <span aria-hidden>·</span>
      <span className="font-mono tabular-nums text-foreground/75">{score}</span>
    </span>
  );
}

function StagePill({ stage }: { stage: (typeof STAGES)[number] }) {
  return (
    <span className="inline-flex w-fit rounded-full border border-border/75 bg-background/70 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {stage.label}
    </span>
  );
}

interface ContactTableProps {
  slug: string;
  openCreateForm?: boolean;
  summary?: ReactNode;
}

export function ContactTable({ slug, openCreateForm = false, summary }: ContactTableProps) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'all' | 'new' | 'rental' | 'buyer'>('all');
  const [tagFilter, setTagFilter] = useState('');
  // Popover-based tag filter. Replaces the previous always-on chip strip,
  // which became unreadable noise once a workspace accumulated >10 tags.
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagPopoverSearch, setTagPopoverSearch] = useState('');
  const [sortBy, setSortBy] = useState<
    'newest' | 'oldest' | 'name-az' | 'name-za' | 'agent-priority'
  >('agent-priority');
  const [importOpen, setImportOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(openCreateForm);
  const [editContact, setEditContact] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  // Set on fetchContacts failure. Used to render an inline banner above the
  // list instead of silently falling through to the "fresh workspace" empty
  // state — which would tell a realtor with 200 contacts they have none.
  const [error, setError] = useState(false);
  // Multi-select moves behind a deliberate Select mode. Default is "scan and
  // tap a row" — the row is a link, no checkbox in sight. Hit Select and the
  // checkboxes appear and the row toggles instead of navigating. The
  // realtor's screenshot showed a permanent checkbox column crowding every
  // row; we owe them that space back.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  // Bulk-tag popover state — the free-text tag to add/remove across the
  // selection, plus the popover open flag so it closes after an action.
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const contactsRequestRef = useRef(0);
  const { confirm, ConfirmDialog } = useConfirm();

  // Staggered row entrance fires exactly once — the FIRST paint of a loaded
  // list. Refetches (edits, deletes, searches) re-render
  // with the flag already true, so rows never re-choreograph. Same
  // rAF-deferred pattern as the kanban columns: the flag flips one frame
  // after the initial entrance commits.
  const hasStaggeredRef = useRef(false);
  useEffect(() => {
    if (loading || error || contacts.length === 0 || hasStaggeredRef.current) return;
    const id = requestAnimationFrame(() => {
      hasStaggeredRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [loading, error, contacts.length]);

  // Sticky select-all strip: a zero-height sentinel sits just above it; once
  // the sentinel scrolls out of view the strip is pinned, and it gains a
  // hairline shadow so content visibly slides beneath it.
  const stickySentinelRef = useRef<HTMLDivElement>(null);
  const [headerStuck, setHeaderStuck] = useState(false);
  useEffect(() => {
    if (!selectMode) {
      setHeaderStuck(false);
      return;
    }
    const el = stickySentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setHeaderStuck(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [selectMode]);

  // The global quick-create menu can open this form from any realtor route.
  // Keep the URL as the cross-route hand-off, then remove the flag when the
  // dialog closes so choosing "New contact" again always re-opens it.
  useEffect(() => {
    if (openCreateForm) setAddOpen(true);
  }, [openCreateForm]);

  function handleAddOpenChange(open: boolean) {
    setAddOpen(open);
    if (!open && openCreateForm) {
      router.replace(`/s/${slug}/contacts`, { scroll: false });
    }
  }

  // The complete cut a saved view restores. Captures the WHOLE filter set
  // (not just the stage) so reloading a complex view — "Buyers · hot · tagged
  // spring-move, name A–Z" — comes back exactly as the realtor left it.
  type ContactViewFilters = {
    search?: string;
    typeFilter?: string;
    leadTypeFilter?: typeof leadTypeFilter;
    tagFilter?: string;
    sortBy?: typeof sortBy;
  };

  // Load saved views from the server (space-scoped). Falls back to the legacy
  // per-browser localStorage payload if the API is unreachable, so a saved cut
  // never silently vanishes on a flaky network.
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/saved-views?slug=${encodeURIComponent(slug)}&entity=contact`);
        if (!res.ok) throw new Error('fetch failed');
        const data: SavedView[] = await res.json();
        if (!cancelled) setSavedViews(Array.isArray(data) ? data : []);
      } catch {
        try {
          const stored = localStorage.getItem(`saved-views-contacts-${slug}`);
          if (stored && !cancelled) setSavedViews(JSON.parse(stored));
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleSaveView() {
    const name = saveViewName.trim();
    if (!name || savingView) return;
    const filters: ContactViewFilters = {
      search,
      typeFilter,
      leadTypeFilter,
      tagFilter,
      sortBy,
    };
    setSavingView(true);
    try {
      const res = await fetch('/api/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, entity: 'contact', name, filters }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Couldn't save that view. Try again.");
        return;
      }
      const created: SavedView = await res.json();
      setSavedViews((prev) => [created, ...prev]);
      setSaveViewName('');
      setShowSaveInput(false);
      toast.success('View saved.');
    } catch {
      toast.error("Couldn't save that view. Try again.");
    } finally {
      setSavingView(false);
    }
  }

  function applyView(view: SavedView) {
    const f = (view.filters ?? {}) as ContactViewFilters;
    setSearch(f.search ?? '');
    setTypeFilter(f.typeFilter ?? 'ALL');
    setLeadTypeFilter(f.leadTypeFilter ?? 'all');
    setTagFilter(f.tagFilter ?? '');
    if (f.sortBy) setSortBy(f.sortBy);
  }

  async function deleteView(id: string) {
    const prev = savedViews;
    // Optimistic — the chip vanishes immediately; restore on failure.
    setSavedViews((views) => views.filter((v) => v.id !== id));
    try {
      const res = await fetch(
        `/api/saved-views?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('delete failed');
    } catch {
      setSavedViews(prev);
      toast.error("Couldn't delete that view. Try again.");
    }
  }

  const fetchContacts = useCallback(async () => {
    const requestId = ++contactsRequestRef.current;
    try {
      const pageSize = 500;
      const allContacts: Client[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const params = new URLSearchParams({
          slug,
          search,
          type: typeFilter,
          limit: String(pageSize),
          offset: String(offset),
        });
        const res = await fetch(`/api/contacts?${params}`);
        if (!res.ok) throw new Error('contacts_fetch_failed');
        const page = (await res.json()) as Client[];
        if (requestId !== contactsRequestRef.current) return;
        allContacts.push(...page);
        if (page.length < pageSize) break;
      }
      if (requestId !== contactsRequestRef.current) return;
      setContacts(allContacts);
      setError(false);
    } catch (err) {
      if (requestId !== contactsRequestRef.current) return;
      console.error('[contact-table] fetchContacts failed:', err);
      setError(true);
    } finally {
      if (requestId === contactsRequestRef.current) setLoading(false);
    }
  }, [slug, search, typeFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Leaving Select mode clears the active selection — no orphaned state.
  useEffect(() => {
    if (!selectMode) setSelectedIds(new Set());
  }, [selectMode]);

  // Esc clears the selection AND exits Select mode — single calming gesture
  // for "I'm done with this," same shortcut the drafts inbox uses.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedIds.size > 0) {
          setSelectedIds(new Set());
        } else if (selectMode) {
          setSelectMode(false);
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectMode, selectedIds.size]);

  async function handleAdd(data: any) {
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, slug }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to add contact');
    }
    fetchContacts();
  }

  async function handleEdit(data: any) {
    if (!editContact) return;
    const res = await fetch(`/api/contacts/${editContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Failed to update contact');
    }
    setEditContact(null);
    fetchContacts();
  }

  function handleDelete(id: string) {
    const contact = contacts.find((c) => c.id === id);
    // Gmail-style undo: remove from the list immediately, but defer the real
    // DELETE for a grace window so a mis-click is one tap to recover instead of
    // a permanent, unrecoverable loss. No confirm modal — the Undo IS the
    // safety net, and it's far less friction. If the window elapses without an
    // undo, the delete commits; if the tab closes first, nothing is destroyed
    // (the row simply reappears on reload — we fail toward keeping data).
    setContacts((prev) => prev.filter((c) => c.id !== id));
    let undone = false;
    const commit = setTimeout(async () => {
      if (undone) return;
      try {
        const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
        if (!res.ok) {
          toast.error("Couldn't delete that contact. It's back on your list.");
          fetchContacts();
        }
      } catch {
        toast.error("Couldn't delete that contact. It's back on your list.");
        fetchContacts();
      }
    }, 5000);
    toast(`${contact?.name ?? 'Contact'} deleted.`, {
      duration: 5000,
      action: {
        label: 'Undo',
        onClick: () => {
          undone = true;
          clearTimeout(commit);
          fetchContacts(); // row still exists in the DB — re-sync to restore it
        },
      },
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === visibleContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleContacts.map((c) => c.id)));
    }
  }

  /**
   * One round-trip for a bulk action — the server applies it to all selected
   * ids inside its space and hands back per-id results. Returns the parsed
   * `{ ok, applied, results }` payload (or null on a transport error) so each
   * caller can phrase its own toast. Clears the selection + refetches.
   */
  type BulkResult = {
    ok: boolean;
    applied: number;
    results: { id: string; ok: boolean; error?: string }[];
  };
  async function runBulk(payload: Record<string, unknown>): Promise<BulkResult | null> {
    const ids = [...selectedIds];
    try {
      const res = await fetch('/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ids, ...payload }),
      });
      if (!res.ok) return null;
      return (await res.json()) as BulkResult;
    } catch {
      return null;
    } finally {
      setSelectedIds(new Set());
      fetchContacts();
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const confirmed = await confirm({
      title: `Delete ${countLabel(ids.length, 'client')}?`,
      description: "These will be gone. I can't bring them back.",
    });
    if (!confirmed) return;
    // Delete stays on the per-id DELETE route — the bulk endpoint is for
    // reversible mutations; destructive removal keeps its existing path.
    try {
      const results = await Promise.allSettled(
        ids.map((id) => fetch(`/api/contacts/${id}`, { method: 'DELETE' })),
      );
      const failures = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok),
      );
      if (failures.length === 0) {
        toast.success(`Deleted ${ids.length} contacts.`);
      } else if (failures.length === ids.length) {
        toast.error("Couldn't delete those contacts. Try again.");
      } else {
        toast.success(`Deleted ${ids.length - failures.length} contacts.`);
        toast.error(`${failures.length} got stuck. Try those again.`);
      }
    } catch {
      toast.error("Couldn't delete those contacts. Try again.");
    } finally {
      setSelectedIds(new Set());
      fetchContacts();
    }
  }

  async function handleBulkChangeType(newType: Client['type']) {
    const ids = [...selectedIds];
    const prevTypes = new Map<string, Client['type']>();
    for (const id of ids) {
      const contact = contacts.find((c) => c.id === id);
      if (contact) prevTypes.set(id, contact.type);
    }
    const result = await runBulk({ action: 'set-stage', stage: newType });
    if (!result) {
      toast.error("Couldn't update those contacts. Try again.");
      return;
    }
    const successes = result.applied;
    const failedIds = result.results.filter((r) => !r.ok).map((r) => r.id);
    const failures = failedIds.length;
    const stageLabel = stageLabels[newType] ?? newType.toLowerCase();
    if (successes > 0) {
      toast.success(`Moved ${successes} to ${stageLabel}.`, {
        action: {
          label: 'Undo',
          onClick: () => undoBulkStageChange(prevTypes),
        },
      });
    }
    // Keep ONLY the failed rows selected so retrying is one tap on the same
    // action — instead of the realtor hunting for which ones got stuck. A clean
    // full success clears the selection.
    if (failures > 0) {
      toast.error(`${failures} got stuck — still selected. Try again.`);
      setSelectedIds(new Set(failedIds));
    } else {
      setSelectedIds(new Set());
    }
  }

  async function undoBulkStageChange(prevTypes: Map<string, Client['type']>) {
    // Undo restores each contact's prior stage. Grouped by target stage so the
    // whole undo is at most three bulk calls rather than N.
    const byStage = new Map<Client['type'], string[]>();
    for (const [id, type] of prevTypes) {
      const arr = byStage.get(type) ?? [];
      arr.push(id);
      byStage.set(type, arr);
    }
    try {
      const settled = await Promise.allSettled(
        [...byStage.entries()].map(([type, ids]) =>
          fetch('/api/contacts/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              slug,
              ids,
              action: 'set-stage',
              stage: type,
            }),
          }),
        ),
      );
      // Promise.allSettled never rejects, so we must inspect each result AND
      // each response's ok status — otherwise a fully-failed undo still shows
      // "Moved back." Report the true outcome instead of an optimistic lie.
      const allOk = settled.every((r) => r.status === 'fulfilled' && r.value.ok);
      const anyOk = settled.some((r) => r.status === 'fulfilled' && r.value.ok);
      if (allOk) {
        toast.success('Moved back.');
      } else if (anyOk) {
        toast.error('Only some moved back. Check the list and retry the rest.');
      } else {
        toast.error("Couldn't undo. Try moving them manually.");
      }
    } catch {
      toast.error("Couldn't undo. Try moving them manually.");
    } finally {
      fetchContacts();
    }
  }

  async function handleBulkTag(tag: string, mode: 'add' | 'remove') {
    const t = tag.trim();
    if (!t) return;
    const count = selectedIds.size;
    const result = await runBulk({
      action: mode === 'add' ? 'tag-add' : 'tag-remove',
      tag: t,
    });
    if (!result) {
      toast.error("Couldn't update tags. Try again.");
      return;
    }
    const verb = mode === 'add' ? 'Tagged' : 'Untagged';
    if (result.applied > 0) toast.success(`${verb} ${countLabel(result.applied, 'contact')}.`);
    const failures = result.results.length - result.applied;
    if (failures > 0) toast.error(`${failures} got stuck. Try those again.`);
    if (result.applied === 0 && failures === 0) toast.success(`No change for ${count}.`);
  }

  async function handleBulkArchive() {
    const count = selectedIds.size;
    const result = await runBulk({ action: 'archive' });
    if (!result) {
      toast.error("Couldn't archive those contacts. Try again.");
      return;
    }
    if (result.applied > 0) {
      toast.success(`Archived ${countLabel(result.applied, 'contact')}.`);
    }
    const failures = result.results.length - result.applied;
    if (failures > 0) toast.error(`${failures} got stuck. Try those again.`);
    if (result.applied === 0 && failures === 0 && count > 0) {
      toast.error("Couldn't archive those contacts. Try again.");
    }
  }

  function handleExportSelected() {
    const toExport = visibleContacts.filter((c) => selectedIds.has(c.id));
    exportContactsCSV(toExport);
  }

  function handleExportAll() {
    exportContactsCSV(visibleContacts);
  }

  function exportContactsCSV(items: Client[]) {
    downloadCSV(
      'contacts.csv',
      items.map((c) => ({
        Name: c.name,
        Stage: c.type,
        Phone: c.phone ?? '',
        Email: c.email ?? '',
        'Budget ($/mo)': c.budget ?? '',
        Address: c.address ?? '',
        Preferences: c.preferences ?? '',
        Notes: c.notes ?? '',
        Tags: c.tags.join('; '),
        'Follow-up': c.followUpAt ? new Date(c.followUpAt).toLocaleDateString('en-US') : '',
        Added: new Date(c.createdAt).toLocaleDateString('en-US'),
      })),
    );
  }

  // Unique user-defined tags (exclude system tags)
  const SYSTEM_TAGS = new Set(['application-link', 'new-lead']);
  const allTags = Array.from(
    new Set(contacts.flatMap((c) => c.tags.filter((t) => !SYSTEM_TAGS.has(t)))),
  ).sort();

  // Apply tag + leadType filters and sorting client-side
  const visibleContacts = (() => {
    let list = contacts
      .filter((c) => {
        if (leadTypeFilter === 'all') return true;
        if (leadTypeFilter === 'new') return c.tags.includes('new-lead');
        return c.leadType === leadTypeFilter;
      })
      .filter((c) => !tagFilter || c.tags.includes(tagFilter));
    if (sortBy === 'agent-priority') {
      list = [...list].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    } else if (sortBy === 'oldest') {
      list = [...list].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else if (sortBy === 'newest') {
      list = [...list].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    } else if (sortBy === 'name-az') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-za') {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    }
    return list;
  })();

  // Tolerate both the server shape (entity) and the legacy localStorage shape
  // (page) so a fallback payload still renders. A view with neither field set
  // (shouldn't happen) is assumed to be a contact view.
  const contactViews = savedViews.filter(
    (v) => v.entity === 'contact' || v.page === 'contacts' || (!v.entity && !v.page),
  );

  const leadTypeChips: {
    key: 'all' | 'new' | 'rental' | 'buyer';
    label: string;
    count: number;
  }[] = [
    { key: 'all', label: 'All', count: contacts.length },
    {
      key: 'new',
      label: 'New',
      count: contacts.filter((c) => c.tags.includes('new-lead')).length,
    },
    {
      key: 'rental',
      label: 'Rental',
      count: contacts.filter((c) => c.leadType === 'rental').length,
    },
    {
      key: 'buyer',
      label: 'Buyer',
      count: contacts.filter((c) => c.leadType === 'buyer').length,
    },
  ];

  const sortLabels: Record<typeof sortBy, string> = {
    'agent-priority': 'Hottest first',
    newest: 'Recently added',
    oldest: 'Oldest first',
    'name-az': 'Name A–Z',
    'name-za': 'Name Z–A',
  };

  const stageLabels: Record<string, string> = {
    ALL: 'All stages',
    QUALIFICATION: 'Qualifying',
    TOUR: 'Tour',
    APPLICATION: 'Applied',
  };

  // Subtitle copy — one quiet sentence, count-aware. The old loud chrome
  // ("Qualifying 5 → Tour 0 → Applied 0 → 5 total" pipeline strip) is gone;
  // the stage filter carries the cut, and a sentence carries the count.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeekCount = contacts.filter(
    (c) => new Date(c.createdAt).getTime() >= weekAgo,
  ).length;
  const subtitle = (() => {
    if (loading || error) return null;
    if (contacts.length === 0) return null;
    const label = countLabel(contacts.length, 'contact');
    if (newThisWeekCount > 0) {
      return `${label} · ${newThisWeekCount} new this week.`;
    }
    return `${label}.`;
  })();

  return (
    <div className="space-y-10 sm:space-y-12" data-page-family="relationship-directory">
      {/* The relationship book opens like a directory, not another generic
          dashboard page. The count anchors the left edge; purpose and action
          sit opposite it. Filters and records keep their existing behavior. */}
      <header className="grid gap-8 border-b border-border/60 pb-9 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)] lg:items-end lg:gap-14">
        <div className="min-w-0">
          <p className={SECTION_LABEL}>Relationship book</p>
          <div className="mt-5 flex items-end gap-3">
            <span
              className="text-[4.75rem] leading-[.78] tracking-[-0.065em] text-foreground tabular-nums sm:text-[6.5rem]"
              style={TITLE_FONT}
            >
              {loading ? '—' : <AnimatedNumber value={contacts.length} duration={560} />}
            </span>
            <span className="pb-1 text-sm text-muted-foreground sm:pb-2">people</span>
          </div>
          {subtitle && <p className={cn(BODY_MUTED, 'mt-5')}>{subtitle}</p>}
        </div>
        <div className="flex flex-col items-start gap-5 lg:items-end lg:text-right">
          <div className="max-w-md space-y-2">
            <h1 className={cn(H1, 'text-[2.4rem] leading-[.96] sm:text-[3.15rem]')} style={TITLE_FONT}>
              <SplitReveal as="span" text="People worth staying close to." />
            </h1>
            <p className={BODY_MUTED}>
              Find the next relationship to move, then keep every detail and follow-up in one place.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={cn(PRIMARY_PILL, 'w-fit shrink-0')}
          >
            Add person
          </button>
        </div>
      </header>

      {summary}

      <section aria-label="Contact directory" className={cn(DASHBOARD_SURFACE, 'overflow-hidden')}>
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          {/* One compact records spine: lead cut, filters, then one hairline
              list. It scrolls horizontally only at the controls on narrow
              screens; the records themselves always remain a list. */}
          {!loading && !error && contacts.length > 0 && (
            <Reveal variant="fade">
              <div
                role="tablist"
                aria-label="Filter people"
                className="-mb-px flex items-center gap-5 overflow-x-auto border-b border-border/70"
              >
                {leadTypeChips.map((chip) => {
                  const active = leadTypeFilter === chip.key;
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setLeadTypeFilter(chip.key)}
                      className={cn(
                        'relative -mb-px inline-flex shrink-0 items-center gap-1.5 pb-3 pt-0.5 text-sm transition-colors duration-150 ease-out',
                        active
                          ? 'font-medium text-foreground'
                          : 'font-normal text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {chip.label}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[11px] tabular-nums transition-colors duration-150 ease-out',
                          active
                            ? 'bg-foreground/[0.06] text-foreground/70'
                            : 'bg-foreground/[0.035] text-muted-foreground',
                        )}
                      >
                        <AnimatedNumber value={chip.count} duration={500} />
                      </span>
                      {active && (
                        <span
                          aria-hidden
                          className="absolute -bottom-px left-0 right-0 h-px bg-foreground/75"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Reveal>
          )}

          {!loading && !error && contacts.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  placeholder="Search…"
                  className="h-9 w-full rounded-full border-border/70 bg-background pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:ml-auto sm:w-auto sm:pb-0">
                {/* Stage filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
                    >
                      <span className="text-muted-foreground">Stage:</span>
                      {stageLabels[typeFilter] ?? 'All stages'}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {(['ALL', 'QUALIFICATION', 'TOUR', 'APPLICATION'] as const).map((key) => (
                      <DropdownMenuItem
                        key={key}
                        onSelect={() => setTypeFilter(key)}
                        className={cn(typeFilter === key && 'font-semibold')}
                      >
                        {stageLabels[key]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Tag filter — hidden when no user-defined tags exist. */}
                {allTags.length > 0 && (
                  <div className="flex shrink-0 items-center overflow-hidden rounded-full border border-border/70 bg-background">
                    <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'inline-flex h-9 items-center px-3 text-xs font-medium transition-colors hover:bg-foreground/[0.04]',
                            tagFilter ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          <span className="max-w-[160px] truncate">{tagFilter || 'Tag'}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-64 p-0">
                        <div className="border-b border-border/60 px-2 py-1.5">
                          <Input
                            value={tagPopoverSearch}
                            onChange={(e) => setTagPopoverSearch(e.target.value)}
                            placeholder="Search tags…"
                            className="h-8 border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                            autoFocus
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                          {(() => {
                            const q = tagPopoverSearch.trim().toLowerCase();
                            const filtered = q
                              ? allTags.filter((t) => t.toLowerCase().includes(q))
                              : allTags;
                            if (filtered.length === 0) {
                              return (
                                <p className="px-3 py-2 text-xs text-muted-foreground">
                                  No tags match.
                                </p>
                              );
                            }
                            return filtered.map((tag) => {
                              const active = tagFilter === tag;
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    setTagFilter(active ? '' : tag);
                                    setTagPopoverOpen(false);
                                    setTagPopoverSearch('');
                                  }}
                                  className={cn(
                                    'w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-foreground/[0.04]',
                                    active && 'font-semibold text-foreground',
                                  )}
                                >
                                  {tag}
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {tagFilter && (
                      <button
                        type="button"
                        aria-label="Clear tag filter"
                        onClick={() => setTagFilter('')}
                        className="mr-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                )}

                {/* Sort */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
                    >
                      <span className="text-muted-foreground">Sort:</span>
                      {sortLabels[sortBy]}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {(Object.keys(sortLabels) as (keyof typeof sortLabels)[]).map((key) => (
                      <DropdownMenuItem
                        key={key}
                        onSelect={() => setSortBy(key)}
                        className={cn(sortBy === key && 'font-semibold')}
                      >
                        {sortLabels[key]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Select-mode toggle — bulk actions live behind a deliberate
                gesture instead of a permanent checkbox column on every row. */}
                <button
                  type="button"
                  onClick={() => setSelectMode((s) => !s)}
                  aria-pressed={selectMode}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors',
                    selectMode
                      ? 'border-border/80 bg-dashboard-paper-muted text-foreground'
                      : 'bg-background border-border/70 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                  )}
                >
                  {selectMode ? 'Done' : 'Select'}
                </button>

                {/* Overflow */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="More options"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onSelect={() => setShowSaveInput(true)}>
                      Save view
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setImportOpen(true)}>Import</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setDuplicatesOpen(true)}>
                      Find duplicates
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => handleExportAll()}
                      disabled={contacts.length === 0}
                    >
                      Export
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Save-view inline input */}
          {showSaveInput && (
            <div className="flex items-center gap-1.5">
              <input
                ref={saveInputRef}
                type="text"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="Name this view…"
                className="h-8 w-44 rounded-full border border-border/70 bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveView();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveView}
                disabled={savingView || !saveViewName.trim()}
                className="h-8 rounded-full bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
              >
                {savingView ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setShowSaveInput(false)}
                aria-label="Cancel saving view"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* Saved-view chips */}
          {contactViews.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-xs text-muted-foreground mr-1">Saved:</span>
              {contactViews.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1 text-xs font-medium rounded-full pl-2.5 pr-1 h-6 border border-border/70 bg-background"
                >
                  <button
                    type="button"
                    onClick={() => applyView(v)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteView(v.id)}
                    aria-label={`Delete saved view ${v.name}`}
                    className="w-4 h-4 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Loading skeleton — rows match the dense directory vocabulary. */}
          {loading && (
            <ul className="divide-y divide-border/60">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <li
                  key={i}
                  className="grid grid-cols-1 gap-2 py-3.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_7rem_5rem_7rem_6rem] lg:items-center lg:gap-4"
                >
                  <div className="min-w-0 space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-24 lg:hidden" />
                  </div>
                  <Skeleton className="h-3 w-52 max-w-full" />
                  <Skeleton className="hidden h-5 w-16 rounded-full lg:block" />
                  <Skeleton className="hidden h-3 w-10 lg:block" />
                  <Skeleton className="hidden h-3 w-16 lg:block" />
                </li>
              ))}
            </ul>
          )}

          {/* Inline error banner — fetch failed. */}
          {!loading && error && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="mb-1 text-xl tracking-tight text-foreground" style={TITLE_FONT}>
                I couldn&apos;t reach your contacts.
              </p>
              <p className="text-sm text-muted-foreground">Usually temporary.</p>
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  fetchContacts();
                }}
                className="mt-4 inline-flex h-8 items-center rounded-full bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90"
              >
                Try again
              </button>
            </div>
          )}

          {/* Empty state — context-aware. The fresh-workspace case is where the
          "Tell Chippi → / or fill out the form" pair lives now: when the
          list is empty the affordance earns its place; when it isn't, that
          header CTA was just chrome competing with the title. */}
          {!loading &&
            !error &&
            visibleContacts.length === 0 &&
            (() => {
              const hasStageFilter = typeFilter !== 'ALL';
              const hasLeadTypeFilter = leadTypeFilter !== 'all';
              const hasTagFilter = !!tagFilter;
              const hasAnyFilter = hasStageFilter || hasLeadTypeFilter || hasTagFilter;
              const isSearchOrFilterCase = !!search || hasTagFilter;
              const isFreshWorkspace = !search && !hasAnyFilter && contacts.length === 0;
              const clearAllFilters = () => {
                setTypeFilter('ALL');
                setLeadTypeFilter('all');
                setTagFilter('');
              };

              if (isFreshWorkspace) {
                // First-run composition stays inside the one directory surface:
                // one headline, one line, and the two existing create paths.
                return (
                  <Reveal variant="rise" className="px-6 py-16 text-center">
                    <h2 className="text-2xl tracking-tight text-foreground" style={TITLE_FONT}>
                      No relationships yet.
                    </h2>
                    <p className={cn(BODY_MUTED, 'mt-2 max-w-sm mx-auto')}>
                      Every deal starts with a person — add your first and I&apos;ll keep the
                      details close.
                    </p>
                    <div className="mt-6 flex flex-col items-center gap-2">
                      <Link
                        href={`/s/${slug}/chippi?prefill=${encodeURIComponent(
                          "I'm adding a new person — ",
                        )}`}
                        className={CHIPPI_PILL}
                      >
                        Tell Chippi about someone
                      </Link>
                      <button type="button" onClick={() => setAddOpen(true)} className={QUIET_LINK}>
                        or fill out the form
                      </button>
                    </div>
                  </Reveal>
                );
              }

              if (isSearchOrFilterCase) {
                return (
                  <Reveal
                    variant="fade"
                    className="flex flex-col items-center justify-center py-16 text-center"
                  >
                    <p className="mb-1 text-xl tracking-tight text-foreground" style={TITLE_FONT}>
                      No matches.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Try a shorter query or clear filters.
                    </p>
                    {hasAnyFilter && (
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                      >
                        <X size={13} /> Clear filters
                      </button>
                    )}
                  </Reveal>
                );
              }

              return (
                <Reveal
                  variant="fade"
                  className="flex flex-col items-center justify-center py-16 text-center"
                >
                  <p className="mb-1 text-xl tracking-tight text-foreground" style={TITLE_FONT}>
                    Nothing in this view.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Adjust the current filters to see more.
                  </p>
                  {hasAnyFilter && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                    >
                      <X size={13} /> Clear filters
                    </button>
                  )}
                </Reveal>
              );
            })()}

          {/* The record surface never switches into a contact-card wall. A
              compact desktop header clarifies the columns; mobile keeps the
              same records as stacked, still hairline-divided rows. */}
          {!loading && !error && visibleContacts.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
            >
              {selectMode && (
                <>
                  {/* Zero-height sentinel — drives the stuck detection above. */}
                  <div ref={stickySentinelRef} aria-hidden />
                  <div
                    className={cn(
                      // Sticky so select-all / the running count stay in reach on
                      // a long list. bg-background because content scrolls under
                      // it; the hairline shadow appears only once pinned.
                      'sticky top-0 z-20 -mx-2 mb-1 flex items-center gap-3 border-b border-border/60 bg-dashboard-paper/95 px-2 py-2 backdrop-blur-sm',
                      'transition-shadow duration-200 ease-out',
                      headerStuck && 'shadow-[0_1px_2px_rgb(0_0_0/0.06)]',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedIds.size === visibleContacts.length && visibleContacts.length > 0
                      }
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="rounded border-border cursor-pointer flex-shrink-0"
                    />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {selectedIds.size > 0
                        ? `${selectedIds.size} selected`
                        : `Select up to ${visibleContacts.length}`}
                    </span>
                  </div>
                </>
              )}

              <div
                aria-hidden="true"
                className={cn(
                  'hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_7rem_5rem_7rem_6rem] gap-4 border-b border-border/60 pb-2 lg:grid',
                  SECTION_LABEL,
                  selectMode && 'pl-7',
                )}
              >
                <span>Person</span>
                <span>Contact</span>
                <span>Stage</span>
                <span>Score</span>
                <span>Follow-up</span>
                <span />
              </div>

              <ul className="divide-y divide-border/60">
                {visibleContacts.map((contact, idx) => (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    slug={slug}
                    // First loaded paint only — afterwards rows mount silently.
                    entranceIndex={hasStaggeredRef.current ? null : idx}
                    selectMode={selectMode}
                    selected={selectedIds.has(contact.id)}
                    onToggleSelect={() => toggleSelect(contact.id)}
                    onEdit={() => setEditContact(contact)}
                    onDelete={() => handleDelete(contact.id)}
                  />
                ))}
              </ul>
            </motion.div>
          )}
        </div>
      </section>

      {/* Bulk-action bar — only when something is selected. */}
      {selectedIds.size > 0 && (
        <div className="chippi-dashboard-panel sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl border border-border/70 px-3 py-2 sm:px-4 sm:py-3">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Select onValueChange={(v) => handleBulkChangeType(v as Client['type'])}>
            <SelectTrigger className="h-8 w-36 rounded-full border-0 bg-dashboard-paper-muted text-xs">
              <SelectValue placeholder="Move to stage…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="QUALIFICATION">Qualifying</SelectItem>
              <SelectItem value="TOUR">Tour</SelectItem>
              <SelectItem value="APPLICATION">Applied</SelectItem>
            </SelectContent>
          </Select>

          {/* Bulk tag — add or remove one tag across the whole selection.
              Suggestions come from the workspace's existing user tags. */}
          <Popover
            open={bulkTagOpen}
            onOpenChange={(o) => {
              setBulkTagOpen(o);
              if (!o) setBulkTagInput('');
            }}
          >
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs">
                Tag
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-60 p-0">
              <div className="border-b border-border/60 p-2">
                <Input
                  value={bulkTagInput}
                  onChange={(e) => setBulkTagInput(e.target.value)}
                  placeholder="Tag name…"
                  className="h-8 text-xs"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && bulkTagInput.trim()) {
                      setBulkTagOpen(false);
                      handleBulkTag(bulkTagInput, 'add');
                    }
                  }}
                />
                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!bulkTagInput.trim()}
                    onClick={() => {
                      setBulkTagOpen(false);
                      handleBulkTag(bulkTagInput, 'add');
                    }}
                    className="h-7 flex-1 rounded-full bg-foreground text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    disabled={!bulkTagInput.trim()}
                    onClick={() => {
                      setBulkTagOpen(false);
                      handleBulkTag(bulkTagInput, 'remove');
                    }}
                    className="h-7 flex-1 rounded-full border border-border/70 text-xs font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {allTags.length > 0 && (
                <div className="max-h-40 overflow-y-auto py-1">
                  {allTags
                    .filter((t) =>
                      bulkTagInput.trim()
                        ? t.toLowerCase().includes(bulkTagInput.trim().toLowerCase())
                        : true,
                    )
                    .slice(0, 50)
                    .map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setBulkTagOpen(false);
                          handleBulkTag(tag, 'add');
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {selectedIds.size >= 2 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCompare(true)}
              className="hidden h-8 rounded-full text-xs sm:inline-flex"
            >
              Compare
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportSelected}
            className="h-8 rounded-full text-xs"
          >
            Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkArchive}
            className="h-8 rounded-full text-xs"
          >
            Archive
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={handleBulkDelete}
            className="h-8 rounded-full text-xs"
          >
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {showCompare && selectedIds.size >= 2 && (
        <ApplicationCompare
          slug={slug}
          selectedIds={[...selectedIds]}
          onClose={() => setShowCompare(false)}
        />
      )}
      <ContactForm
        open={addOpen}
        onOpenChange={handleAddOpenChange}
        onSubmit={handleAdd}
        mode="add"
        slug={slug}
      />
      <ContactForm
        key={editContact?.id ?? 'edit-closed'}
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
        onSubmit={handleEdit}
        mode="edit"
        defaultValues={editContact ? contactEditorDefaults(editContact) : undefined}
      />

      {importOpen && (
        <CsvImportModal
          slug={slug}
          onClose={() => setImportOpen(false)}
          onImported={(count) => {
            setImportOpen(false);
            if (count > 0) {
              toast.success('Contacts imported.');
              fetchContacts();
            }
          }}
        />
      )}
      <DuplicatesPanel
        slug={slug}
        open={duplicatesOpen}
        onClose={() => setDuplicatesOpen(false)}
        onMerged={fetchContacts}
      />
      {ConfirmDialog}
    </div>
  );
}

// ─── ContactRow — one disciplined hairline record ──────────────────────────
//
// Desktop aligns real fields as a compact table. Mobile folds those same
// fields beneath the name without changing the record into a card. Selection
// stays a light paper wash and row actions remain available on hover, focus,
// or the existing context menu.

function ContactRow({
  contact,
  slug,
  entranceIndex,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  contact: Client;
  slug: string;
  /** Index for the first-load stagger. `null` = the list already made its
   *  entrance (a refetch) — mount silently, no re-choreography. */
  entranceIndex: number | null;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const stage = STAGES.find((s) => s.key === contact.type)!;
  // First-load stagger, capped at 20 rows — past that, the row enters
  // instantly. 15ms-per-row keeps the whole cascade under a third of a
  // second: one composed gesture, not a parade.
  const shouldAnimate = entranceIndex !== null && entranceIndex < 20;
  const delay = shouldAnimate ? entranceIndex * 0.015 : 0;
  const followUpDate = contact.followUpAt ? new Date(contact.followUpAt) : null;
  const followUpOverdue = followUpDate ? followUpDate < new Date() : false;
  const followUpLabel = followUpDate
    ? `${followUpOverdue ? 'Overdue' : 'Due'} · ${followUpDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })}`
    : '—';
  const contactLine = [contact.email, contact.phone].filter(Boolean).join(' · ');

  // Shared field grid so normal and select modes cannot drift apart.
  const body = (
    <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.25fr)_7rem_5rem_7rem] lg:gap-4">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{contact.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground lg:hidden">
          {contactLine || 'No contact details'}
        </span>
        <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 lg:hidden">
          <StagePill stage={stage} />
          <ScoreChip score={contact.leadScore} />
          {followUpDate && (
            <span
              className={cn(
                'text-[11px]',
                followUpOverdue ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              {followUpLabel}
            </span>
          )}
        </span>
      </span>
      <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
        {contactLine || '—'}
      </span>
      <span className="hidden lg:block">
        <StagePill stage={stage} />
      </span>
      <span className="hidden lg:block">
        <ScoreChip score={contact.leadScore} />
      </span>
      <span
        className={cn(
          'hidden text-[11px] lg:block',
          followUpOverdue ? 'text-destructive' : 'text-muted-foreground',
        )}
      >
        {followUpLabel}
      </span>
    </span>
  );

  const rowClassName = cn(
    'group/row -mx-2 flex items-center gap-3 rounded-xl px-2 py-3.5 transition-colors duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
    selected
      ? 'bg-dashboard-paper-muted ring-1 ring-inset ring-border/60'
      : 'hover:bg-foreground/[0.025]',
  );

  const actions = !selectMode && (
    <div className="hidden w-24 shrink-0 justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover/row:opacity-100 group-focus-within/row:opacity-100 lg:flex">
      <Link
        href={`/s/${slug}/chippi/log?personId=${contact.id}`}
        aria-label={`Log a note for ${contact.name}`}
        title="Log a note"
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Mic size={13} />
      </Link>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${contact.name}`}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Pencil size={13} />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${contact.name}`}
        className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );

  return (
    <motion.li
      // List entrance — 200ms fade + 4px rise, first load only (see
      // entranceIndex). Small enough that the rows read as settling into
      // place, not flying in.
      initial={shouldAnimate ? { opacity: 0, y: 4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_APPLE, delay }}
    >
      {selectMode ? (
        <label className={cn(rowClassName, 'w-full cursor-pointer')}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${contact.name}`}
            className="shrink-0 cursor-pointer rounded border-border"
          />
          {body}
          <span aria-hidden className="hidden w-24 shrink-0 lg:block" />
        </label>
      ) : (
        /* Right-click gets the power-user menu: everything you'd do to a
           person without leaving the list. Left-click still navigates. */
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className={rowClassName}>
              <Link
                href={`/s/${slug}/contacts/${contact.id}`}
                className="flex min-w-0 flex-1 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {body}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Actions for ${contact.name}`}
                    className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48 lg:hidden">
                  <DropdownMenuItem asChild>
                    <Link href={`/s/${slug}/contacts/${contact.id}`}>Open</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/s/${slug}/chippi/log?personId=${contact.id}`}>Log a note</Link>
                  </DropdownMenuItem>
                  {contact.phone && (
                    <DropdownMenuItem asChild><a href={`tel:${contact.phone}`}>Call</a></DropdownMenuItem>
                  )}
                  {contact.email && (
                    <DropdownMenuItem asChild><a href={`mailto:${contact.email}`}>Email</a></DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {actions}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="min-w-48">
            <ContextMenuItem value="open" asChild>
              <Link href={`/s/${slug}/contacts/${contact.id}`}>
                <ChevronRight /> Open
              </Link>
            </ContextMenuItem>
            <ContextMenuItem value="log" asChild>
              <Link href={`/s/${slug}/chippi/log?personId=${contact.id}`}>
                <Mic /> Log a note
              </Link>
            </ContextMenuItem>
            {(contact.phone || contact.email) && <ContextMenuSeparator />}
            {contact.phone && (
              <ContextMenuItem value="call" asChild>
                <a href={`tel:${contact.phone}`}>
                  <Phone /> Call {contact.phone}
                </a>
              </ContextMenuItem>
            )}
            {contact.email && (
              <ContextMenuItem value="email" asChild>
                <a href={`mailto:${contact.email}`}>
                  <Mail /> Email
                </a>
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem value="edit" onClick={onEdit}>
              <Pencil /> Edit
            </ContextMenuItem>
            <ContextMenuItem value="delete" variant="destructive" onClick={onDelete}>
              <Trash2 /> Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </motion.li>
  );
}
