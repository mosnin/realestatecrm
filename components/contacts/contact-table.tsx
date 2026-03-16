'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Bookmark,
  X,
  CheckSquare,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { downloadCSV } from '@/lib/csv';
import type { SavedView } from '@/lib/types';
import { formatCurrency as _formatCurrency, getInitials } from '@/lib/formatting';
import { CONTACT_STAGES } from '@/lib/constants';

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
  const [tagFilter, setTagFilter] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'list'>('card');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [saveViewName, setSaveViewName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef<HTMLInputElement>(null);

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
    const params = new URLSearchParams({ slug, search, type: typeFilter });
    const res = await fetch(`/api/contacts?${params}`);
    if (res.ok) setContacts(await res.json());
    setLoading(false);
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
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, slug }),
    });
    fetchContacts();
  }

  async function handleEdit(data: any) {
    if (!editContact) return;
    await fetch(`/api/contacts/${editContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    setEditContact(null);
    fetchContacts();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this client?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
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
    if (!confirm(`Delete ${ids.length} client${ids.length !== 1 ? 's' : ''}?`)) return;
    await Promise.all(ids.map((id) => fetch(`/api/contacts/${id}`, { method: 'DELETE' })));
    setSelectedIds(new Set());
    fetchContacts();
  }

  async function handleBulkChangeType(newType: Client['type']) {
    const ids = [...selectedIds];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/contacts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: newType }),
        }),
      ),
    );
    setSelectedIds(new Set());
    fetchContacts();
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

  // Apply tag filter client-side
  const visibleContacts = tagFilter
    ? contacts.filter((c) => c.tags.includes(tagFilter))
    : contacts;

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
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
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
              className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 bg-primary text-primary-foreground"
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
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-muted text-muted-foreground border-transparent hover:text-foreground hover:bg-accent',
              )}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
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

          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => setView('card')}
              className={cn(
                'px-2.5 flex items-center justify-center transition-colors',
                view === 'card'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={cn(
                'px-2.5 flex items-center justify-center transition-colors',
                view === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              <List size={15} />
            </button>
          </div>

          <Button onClick={() => setAddOpen(true)} className="gap-2 flex-shrink-0">
            <Plus size={15} />
            Add client
          </Button>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card px-5 py-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-3.5 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleContacts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Search size={20} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">No clients found</p>
          <p className="text-sm text-muted-foreground">
            {tagFilter ? `No clients tagged "${tagFilter}".` : search ? `No clients match "${search}".` : 'Add your first client to get started.'}
          </p>
          {tagFilter && (
            <Button onClick={() => setTagFilter('')} className="mt-4 gap-2" size="sm" variant="outline">
              <X size={14} /> Clear filter
            </Button>
          )}
          {!search && !tagFilter && (
            <Button onClick={() => setAddOpen(true)} className="mt-4 gap-2" size="sm">
              <Plus size={14} /> Add client
            </Button>
          )}
        </div>
      )}

      {/* ── Card view — stage-grouped ── */}
      {!loading && visibleContacts.length > 0 && view === 'card' && (
        <div className="grid gap-5 sm:grid-cols-3">
          {STAGES.map((stage) => {
            const stageContacts = visibleContacts.filter((c) => c.type === stage.key);
            if (stageContacts.length === 0 && !search && !tagFilter) return (
              <div key={stage.key} className={cn('rounded-xl border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[120px] text-center gap-2', stage.border)}>
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
                  <span className={cn('ml-auto text-[11px] font-bold rounded-full px-1.5 py-0.5', stage.className)}>
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
        <div className="rounded-xl border border-border overflow-hidden">
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
                          <Link href={`/s/${slug}/contacts/${contact.id}`} className="font-medium hover:text-primary transition-colors">
                            {contact.name}
                          </Link>
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
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-border bg-card shadow-lg px-4 py-3">
          <CheckSquare size={14} className="text-primary" />
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
      'group rounded-xl border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px',
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
                className="font-semibold text-sm hover:text-primary transition-colors truncate block leading-tight"
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
        </div>
      </div>
    </div>
  );
}
