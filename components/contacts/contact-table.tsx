'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { LiquidMetalButton } from '@/components/ui/liquid-metal-button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactForm } from './contact-form';
import { LeadScoreBar } from '@/components/agent/lead-score-bar';
import { ContactAgentContext } from '@/components/agent/contact-agent-context';
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Phone,
  Mail,
  Wallet,
  MapPin,
  LayoutGrid,
  List,
  ArrowRight,
  Download,
  Upload,
  Bookmark,
  X,
  CheckSquare,
  GitCompare,
  CalendarDays,
  ArrowUpDown,
  MoreHorizontal,
  Users,
  Inbox,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { ApplicationCompare } from './application-compare';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';
import type { SavedView } from '@/lib/types';
import { formatCurrency as _formatCurrency, getInitials } from '@/lib/formatting';
import { CONTACT_STAGES } from '@/lib/constants';
import { CsvImportModal } from './csv-import-modal';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/confirm-dialog';

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

function formatCurrency(value: number | null) {
  if (value == null) return null;
  return _formatCurrency(value);
}

interface ContactTableProps {
  slug: string;
}

export function ContactTable({ slug }: ContactTableProps) {
  const [contacts, setContacts] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'all' | 'rental' | 'buyer'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name-az' | 'name-za' | 'agent-priority'>('agent-priority');
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'list'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Load saved views from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`saved-views-contacts-${slug}`);
      if (stored) setSavedViews(JSON.parse(stored));
    } catch { /* ignore */ }
  }, [slug]);

  function persistSavedViews(views: SavedView[]) {
    setSavedViews(views);
    localStorage.setItem(`saved-views-contacts-${slug}`, JSON.stringify(views));
  }

  function handleSaveView() {
    if (!saveViewName.trim()) return;
    const newView: SavedView = {
      id: crypto.randomUUID(),
      name: saveViewName.trim(),
      page: 'contacts',
      filters: { typeFilter },
    };
    persistSavedViews([...savedViews, newView]);
    setSaveViewName('');
    setShowSaveInput(false);
  }

  function applyView(view: SavedView) {
    const f = view.filters as { typeFilter?: string };
    if (f.typeFilter) setTypeFilter(f.typeFilter);
  }

  function deleteView(id: string) {
    persistSavedViews(savedViews.filter((v) => v.id !== id));
  }

  const fetchContacts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ slug, search, type: typeFilter });
      const res = await fetch(`/api/contacts?${params}`);
      if (res.ok) setContacts(await res.json());
    } catch (err) {
      console.error('[contact-table] fetchContacts failed:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, search, typeFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Clear selection when contacts change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [contacts]);

  // Escape to clear selection
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedIds(new Set());
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

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

  async function handleDelete(id: string) {
    const contact = contacts.find((c) => c.id === id);
    const confirmed = await confirm({
      title: 'Remove this client?',
      description: contact ? `"${contact.name}" will be permanently removed from your CRM.` : 'This client will be permanently removed.',
    });
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Contact deleted');
      } else {
        toast.error('Failed to delete contact');
      }
    } catch {
      toast.error('Failed to delete contact');
    }
    fetchContacts();
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

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    const confirmed = await confirm({
      title: `Delete ${ids.length} client${ids.length !== 1 ? 's' : ''}?`,
      description: 'This will permanently remove the selected clients from your CRM. This cannot be undone.',
    });
    if (!confirmed) return;
    try {
      const results = await Promise.allSettled(ids.map((id) => fetch(`/api/contacts/${id}`, { method: 'DELETE' })));
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length === 0) {
        toast.success(`Deleted ${ids.length} contacts`);
      } else if (failures.length === ids.length) {
        toast.error('Failed to delete contacts');
      } else {
        toast.success(`Deleted ${ids.length - failures.length} contacts`);
        toast.error(`${failures.length} failed to delete`);
      }
    } catch {
      toast.error('Failed to delete contacts');
    } finally {
      setSelectedIds(new Set());
      fetchContacts();
    }
  }

  async function handleBulkChangeType(newType: Client['type']) {
    const ids = [...selectedIds];
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(`/api/contacts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: newType }),
          }),
        ),
      );
      const failures = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
      if (failures.length > 0) {
        toast.error(`${failures.length} contact${failures.length !== 1 ? 's' : ''} failed to update`);
      }
    } catch {
      toast.error('Failed to update contacts');
    } finally {
      setSelectedIds(new Set());
      fetchContacts();
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
    downloadCSV('contacts.csv', items.map((c) => ({
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
      'Added': new Date(c.createdAt).toLocaleDateString('en-US'),
    })));
  }

  // Stage totals for pipeline bar
  const stageCounts = {
    QUALIFICATION: contacts.filter((c) => c.type === 'QUALIFICATION').length,
    TOUR: contacts.filter((c) => c.type === 'TOUR').length,
    APPLICATION: contacts.filter((c) => c.type === 'APPLICATION').length,
  };

  // Unique user-defined tags (exclude system tags)
  const SYSTEM_TAGS = new Set(['application-link', 'new-lead']);
  const allTags = Array.from(
    new Set(contacts.flatMap((c) => c.tags.filter((t) => !SYSTEM_TAGS.has(t))))
  ).sort();

  // Apply tag + leadType filters and sorting client-side
  const visibleContacts = (() => {
    let list = contacts
      .filter((c) => leadTypeFilter === 'all' || c.leadType === leadTypeFilter)
      .filter((c) => !tagFilter || c.tags.includes(tagFilter));
    if (sortBy === 'agent-priority') {
      list = [...list].sort((a, b) => (b.leadScore ?? -1) - (a.leadScore ?? -1));
    } else if (sortBy === 'oldest') {
      list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (sortBy === 'newest') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === 'name-az') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'name-za') {
      list = [...list].sort((a, b) => b.name.localeCompare(a.name));
    }
    return list;
  })();

  const contactViews = savedViews.filter((v) => v.page === 'contacts');

  return (
    <div className="space-y-4">
      {/* Saved view chips */}
      {contactViews.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-muted-foreground mr-1">Saved:</span>
          {contactViews.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-1 text-xs font-medium bg-muted rounded-full pl-2.5 pr-1 py-1">
              <button type="button" onClick={() => applyView(v)} className="hover:text-foreground transition-colors">
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(v.id)}
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Pipeline mini bar (card view only, non-empty) */}
      {!loading && contacts.length > 0 && view === 'card' && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3">
          {STAGES.map((stage, i) => {
            const count = stageCounts[stage.key];
            return (
              <div key={stage.key} className="flex items-center gap-2">
                {i > 0 && (
                  <ArrowRight size={13} className="text-muted-foreground/40 flex-shrink-0" />
                )}
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', stage.dotColor)} />
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                  <span className="text-xs font-semibold tabular-nums text-foreground">{count}</span>
                </div>
              </div>
            );
          })}
          <div className="ml-auto text-xs text-muted-foreground">
            {tagFilter ? `${visibleContacts.length} of ` : ''}{contacts.length} total
          </div>
        </div>
      )}

      {/* Tag filter strip */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter('')}
              className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 bg-foreground text-background"
            >
              <X size={10} />
              Clear tag
            </button>
          )}
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
              className={cn(
                'inline-flex items-center text-xs font-medium rounded-full px-2.5 py-1 border transition-colors',
                tagFilter === tag
                  ? 'bg-foreground text-background border-transparent'
                  : 'bg-muted text-muted-foreground border-transparent hover:text-foreground hover:bg-accent',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Lead type filter */}
      <div className="flex gap-1 items-center">
        <span className="text-xs text-muted-foreground mr-1">Lead type:</span>
        {(['all', 'rental', 'buyer'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setLeadTypeFilter(key)}
            className={cn(
              'inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              leadTypeFilter === key
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80',
            )}
          >
            {key === 'all' ? 'All' : key === 'rental' ? 'Rental' : 'Buyer'}
            {key !== 'all' && (
              <span className={cn('ml-1 tabular-nums', leadTypeFilter === key ? 'opacity-80' : 'opacity-60')}>
                {contacts.filter((c) => c.leadType === key).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Mobile overflow menu — Sort / Filter / Save view / Import / Export */}
        <div className="sm:hidden flex-shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 px-2.5" title="More options">
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Sort</div>
              {([
                { value: 'agent-priority', label: '⚡ Agent priority' },
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
                { value: 'name-az', label: 'Name A-Z' },
                { value: 'name-za', label: 'Name Z-A' },
              ] as const).map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onSelect={() => setSortBy(opt.value)}
                  className={cn(sortBy === opt.value && 'font-semibold')}
                >
                  <ArrowUpDown size={12} />
                  {opt.label}
                </DropdownMenuItem>
              ))}
              {(view === 'list' || search) && (
                <>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Stage</div>
                  {([
                    { value: 'ALL', label: 'All stages' },
                    { value: 'QUALIFICATION', label: 'Qualifying' },
                    { value: 'TOUR', label: 'Tour' },
                    { value: 'APPLICATION', label: 'Applied' },
                  ] as const).map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onSelect={() => setTypeFilter(opt.value)}
                      className={cn(typeFilter === opt.value && 'font-semibold')}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setShowSaveInput(true)}>
                <Bookmark size={12} />
                Save view
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                <Upload size={12} />
                Import
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => handleExportAll()}
                disabled={contacts.length === 0}
              >
                <Download size={12} />
                Export
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Desktop controls — unchanged layout at sm+ */}
        <div className="hidden sm:flex gap-2 flex-wrap">
          {/* Agent priority pill */}
          <button
            type="button"
            onClick={() => setSortBy('agent-priority')}
            className={cn(
              'inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1.5 h-9 border transition-colors flex-shrink-0',
              sortBy === 'agent-priority'
                ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600'
                : 'bg-card text-orange-600 border-orange-200 dark:border-orange-900/60 hover:bg-orange-50 dark:hover:bg-orange-950/30',
            )}
          >
            <Zap size={11} />
            Agent
          </button>

          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="appearance-none rounded-md border border-border bg-card pl-7 pr-8 py-2 text-xs font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring h-9"
            >
              <option value="agent-priority">Agent priority</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-az">Name A-Z</option>
              <option value="name-za">Name Z-A</option>
            </select>
            <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>

          {/* Stage filter — list view only or when searching */}
          {(view === 'list' || search) && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All stages</SelectItem>
                <SelectItem value="QUALIFICATION">Qualifying</SelectItem>
                <SelectItem value="TOUR">Tour</SelectItem>
                <SelectItem value="APPLICATION">Applied</SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Save current view */}
          {showSaveInput ? (
            <div className="flex gap-1">
              <input
                ref={saveInputRef}
                type="text"
                value={saveViewName}
                onChange={(e) => setSaveViewName(e.target.value)}
                placeholder="View name…"
                className="text-xs rounded-md border border-input bg-card px-2 py-1 w-28 focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveView();
                  if (e.key === 'Escape') setShowSaveInput(false);
                }}
                autoFocus
              />
              <Button size="sm" variant="outline" onClick={handleSaveView} className="text-xs h-8 px-2">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowSaveInput(false)} className="h-8 px-2">
                <X size={13} />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSaveInput(true)}
              className="gap-1.5 text-xs h-9"
              title="Save current filter as a view"
            >
              <Bookmark size={12} />
              Save view
            </Button>
          )}

          {/* Import CSV */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-1.5 text-xs h-9"
          >
            <Upload size={12} />
            Import
          </Button>

          {/* Export CSV */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportAll}
            className="gap-1.5 text-xs h-9"
            disabled={contacts.length === 0}
          >
            <Download size={12} />
            Export
          </Button>
        </div>

        {/* View toggle — visible at all breakpoints */}
        <div className="flex rounded-md border border-border overflow-hidden bg-card flex-shrink-0">
          <button
            type="button"
            onClick={() => setView('list')}
            className={cn(
              'px-2.5 py-1.5 flex items-center justify-center transition-colors',
              view === 'list'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <List size={15} />
          </button>
          <button
            type="button"
            onClick={() => setView('card')}
            className={cn(
              'px-2.5 py-1.5 flex items-center justify-center transition-colors',
              view === 'card'
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        <LiquidMetalButton
          label="Add client"
          onClick={() => setAddOpen(true)}
        />
      </div>

      {/* Loading skeleton — matches final full-width row layout */}
      {loading && (
        <div className="rounded-lg border border-border overflow-hidden bg-card divide-y divide-border">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 h-[56px]">
              <Skeleton className="h-4 w-4 rounded-sm flex-shrink-0" />
              <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
              <Skeleton className="h-3.5 w-32 sm:w-40 flex-shrink-0" />
              <Skeleton className="h-5 w-16 rounded-full hidden sm:block flex-shrink-0" />
              <Skeleton className="h-3 flex-1 max-w-[220px] hidden sm:block" />
              <Skeleton className="h-3 w-16 hidden md:block flex-shrink-0" />
              <Skeleton className="h-3 w-28 hidden lg:block flex-shrink-0" />
              <Skeleton className="ml-auto h-3 w-12 hidden xl:block flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state — context-aware */}
      {!loading && visibleContacts.length === 0 && (() => {
        const hasStageFilter = typeFilter !== 'ALL';
        const hasLeadTypeFilter = leadTypeFilter !== 'all';
        const hasTagFilter = !!tagFilter;
        const hasAnyFilter = hasStageFilter || hasLeadTypeFilter || hasTagFilter;
        const isSearchOrFilterCase = !!search || hasTagFilter;
        // When no search and no tag filter, `contacts` holds the API result filtered
        // only by stage (server-side). If a server-side filter OR lead-type filter
        // produced an empty view while contacts exist otherwise, treat it as a
        // "this view" case. If everything is unset and contacts is empty, the
        // workspace is fresh.
        const isFreshWorkspace = !search && !hasAnyFilter && contacts.length === 0;
        const clearAllFilters = () => {
          setTypeFilter('ALL');
          setLeadTypeFilter('all');
          setTagFilter('');
        };

        if (isFreshWorkspace) {
          return (
            <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Users size={20} className="text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground mb-1">No contacts yet</p>
              <p className="text-sm text-muted-foreground">
                Add one or import a list to get started.
              </p>
              <div className="mt-4 flex gap-2 justify-center">
                <Button onClick={() => setAddOpen(true)} className="gap-2" size="sm">
                  <Plus size={14} /> Add contact
                </Button>
                <Button onClick={() => setImportOpen(true)} className="gap-2" size="sm" variant="outline">
                  <Upload size={14} /> Import
                </Button>
              </div>
            </div>
          );
        }

        if (isSearchOrFilterCase) {
          return (
            <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Search size={20} className="text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground mb-1">No matches for that search</p>
              <p className="text-sm text-muted-foreground">
                Try a shorter query or clear filters.
              </p>
              {hasAnyFilter && (
                <Button onClick={clearAllFilters} className="mt-4 gap-2" size="sm" variant="outline">
                  <X size={14} /> Clear filters
                </Button>
              )}
            </div>
          );
        }

        // Filters cleared of search/tag but stage or lead-type filter hides everything.
        return (
          <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-6">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Inbox size={20} className="text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground mb-1">This view has no matches right now</p>
            <p className="text-sm text-muted-foreground">
              Adjust the current filters to see more contacts.
            </p>
            {hasAnyFilter && (
              <Button onClick={clearAllFilters} className="mt-4 gap-2" size="sm" variant="outline">
                <X size={14} /> Clear filters
              </Button>
            )}
          </div>
        );
      })()}

      {/* ── Card view — stage-grouped ── */}
      {!loading && visibleContacts.length > 0 && view === 'card' && (
        <div className="grid gap-5 sm:grid-cols-3">
          {STAGES.map((stage) => {
            const stageContacts = visibleContacts.filter((c) => c.type === stage.key);
            if (stageContacts.length === 0 && !search && !tagFilter) return (
              <div key={stage.key} className={cn('rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[120px] text-center gap-2', stage.border)}>
                <span className={cn('w-2 h-2 rounded-full', stage.dotColor)} />
                <p className="text-xs font-semibold text-muted-foreground">{stage.label}</p>
                <p className="text-[11px] text-muted-foreground/60">{stage.description}</p>
              </div>
            );
            if (stageContacts.length === 0) return null;
            return (
              <div key={stage.key} className="flex flex-col gap-2">
                {/* Stage column header */}
                <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2', stage.headerBg)}>
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', stage.dotColor)} />
                  <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                  <span className={cn('ml-auto text-[11px] font-bold rounded-md px-1.5 py-0.5', stage.className)}>
                    {stageContacts.length}
                  </span>
                </div>

                {/* Cards in this stage */}
                {stageContacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    slug={slug}
                    onEdit={() => setEditContact(contact)}
                    onDelete={() => handleDelete(contact.id)}
                    stageClassName={stage.className}
                    selected={selectedIds.has(contact.id)}
                    onToggleSelect={() => toggleSelect(contact.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {!loading && visibleContacts.length > 0 && view === 'list' && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === visibleContacts.length && visibleContacts.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded border-border cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Preferences</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Follow-up</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {visibleContacts.map((contact) => {
                  const stage = STAGES.find((s) => s.key === contact.type)!;
                  const isSelected = selectedIds.has(contact.id);
                  return (
                    <tr
                      key={contact.id}
                      className={cn(
                        'group hover:bg-muted/30 transition-colors',
                        isSelected && 'bg-primary/5',
                      )}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(contact.id)}
                          className="rounded border-border cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                            {getInitials(contact.name)}
                          </div>
                          <div className="min-w-0">
                            <Link href={`/s/${slug}/contacts/${contact.id}`} className="font-medium hover:text-foreground transition-colors block">
                              {contact.name}
                            </Link>
                            <LeadScoreBar score={contact.leadScore ?? null} />
                            <ContactAgentContext contactId={contact.id} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5', stage.className)}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="space-y-0.5">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-[180px]">
                              <Mail size={10} className="flex-shrink-0" />
                              {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Phone size={10} className="flex-shrink-0" />
                              {contact.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                        {contact.budget != null ? `${formatCurrency(contact.budget)}/mo` : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                        {contact.preferences ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {contact.followUpAt ? (
                          <span className={cn(
                            'inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5',
                            new Date(contact.followUpAt) < new Date()
                              ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                          )}>
                            <CalendarDays size={10} />
                            {new Date(contact.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <button type="button" onClick={() => setEditContact(contact)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => handleDelete(contact.id)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-border bg-card shadow-lg px-4 py-3">
          <CheckSquare size={14} className="text-foreground" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Select onValueChange={(v) => handleBulkChangeType(v as Client['type'])}>
            <SelectTrigger className="h-8 text-xs w-36 bg-muted border-0">
              <SelectValue placeholder="Move to stage…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="QUALIFICATION">Qualifying</SelectItem>
              <SelectItem value="TOUR">Tour</SelectItem>
              <SelectItem value="APPLICATION">Applied</SelectItem>
            </SelectContent>
          </Select>
          {selectedIds.size >= 2 && (
            <Button size="sm" variant="outline" onClick={() => setShowCompare(true)} className="h-8 gap-1.5 text-xs">
              <GitCompare size={12} />
              Compare
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleExportSelected} className="h-8 gap-1.5 text-xs">
            <Download size={12} />
            Export
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="h-8 text-xs">
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
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
      <ContactForm open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} title="Add Client" />
      <ContactForm
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
        onSubmit={handleEdit}
        title="Edit Client"
        defaultValues={
          editContact
            ? {
                name: editContact.name,
                email: editContact.email ?? '',
                phone: editContact.phone ?? '',
                budget: editContact.budget?.toString() ?? '',
                preferences: editContact.preferences ?? '',
                properties: editContact.properties.join(', '),
                address: editContact.address ?? '',
                notes: editContact.notes ?? '',
                type: editContact.type,
                tags: editContact.tags.join(', '),
              }
            : undefined
        }
      />

      {importOpen && (
        <CsvImportModal
          slug={slug}
          onClose={() => setImportOpen(false)}
          onImported={(count) => {
            setImportOpen(false);
            if (count > 0) {
              toast.success('Contacts imported successfully');
              fetchContacts();
            }
          }}
        />
      )}
      {ConfirmDialog}
    </div>
  );
}

// ── Contact card sub-component ────────────────────────────────────────────────

function ContactCard({
  contact,
  slug,
  onEdit,
  onDelete,
  stageClassName,
  selected,
  onToggleSelect,
}: {
  contact: Client;
  slug: string;
  onEdit: () => void;
  onDelete: () => void;
  stageClassName: string;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div className={cn(
      'group rounded-lg border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px',
      selected ? 'border-primary/40 bg-primary/5' : 'border-border',
    )}>
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-border cursor-pointer flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity data-[checked=true]:opacity-100"
              data-checked={selected}
            />
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
              {getInitials(contact.name)}
            </div>
            <div className="min-w-0">
              <Link
                href={`/s/${slug}/contacts/${contact.id}`}
                className="font-semibold text-sm hover:text-foreground transition-colors truncate block leading-tight"
              >
                {contact.name}
              </Link>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            <button type="button" onClick={onEdit} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Pencil size={12} />
            </button>
            <button type="button" onClick={onDelete} className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-1">
          {contact.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone size={10} className="flex-shrink-0" />
              <a href={`tel:${contact.phone}`} className="truncate hover:text-foreground transition-colors">
                {contact.phone}
              </a>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail size={10} className="flex-shrink-0" />
              <a href={`mailto:${contact.email}`} className="truncate hover:text-foreground transition-colors">
                {contact.email}
              </a>
            </div>
          )}
          {contact.budget != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet size={10} className="flex-shrink-0" />
              <span>{formatCurrency(contact.budget)}/mo</span>
            </div>
          )}
          {contact.preferences && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin size={10} className="flex-shrink-0" />
              <span className="truncate">{contact.preferences}</span>
            </div>
          )}
          {contact.followUpAt && (
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              new Date(contact.followUpAt) < new Date() ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
            )}>
              <CalendarDays size={10} className="flex-shrink-0" />
              <span>
                {new Date(contact.followUpAt) < new Date() ? 'Overdue' : 'Due'}{' '}
                {new Date(contact.followUpAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
