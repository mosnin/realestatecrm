'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

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

const STAGES = [
  {
    key: 'QUALIFICATION' as const,
    label: 'Qualifying',
    description: 'Initial review',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
    dotColor: 'bg-blue-400',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    headerBg: 'bg-blue-50/60 dark:bg-blue-500/5',
  },
  {
    key: 'TOUR' as const,
    label: 'Tour',
    description: 'Showing scheduled',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    dotColor: 'bg-amber-400',
    border: 'border-amber-200/60 dark:border-amber-800/40',
    headerBg: 'bg-amber-50/60 dark:bg-amber-500/5',
  },
  {
    key: 'APPLICATION' as const,
    label: 'Applied',
    description: 'Application submitted',
    className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400',
    dotColor: 'bg-green-400',
    border: 'border-green-200/60 dark:border-green-800/40',
    headerBg: 'bg-green-50/60 dark:bg-green-500/5',
  },
];

function formatCurrency(value: number | null) {
  if (value == null) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

interface ContactTableProps {
  slug: string;
}

export function ContactTable({ slug }: ContactTableProps) {
  const [contacts, setContacts] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'card' | 'list'>('card');

  const fetchContacts = useCallback(async () => {
    const params = new URLSearchParams({ slug, search, type: typeFilter });
    const res = await fetch(`/api/contacts?${params}`);
    if (res.ok) setContacts(await res.json());
    setLoading(false);
  }, [slug, search, typeFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

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

  // Stage totals for pipeline bar
  const stageCounts = {
    QUALIFICATION: contacts.filter((c) => c.type === 'QUALIFICATION').length,
    TOUR: contacts.filter((c) => c.type === 'TOUR').length,
    APPLICATION: contacts.filter((c) => c.type === 'APPLICATION').length,
  };

  return (
    <div className="space-y-4">
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
            {contacts.length} total
          </div>
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
        <div className="flex gap-2">
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
      {!loading && contacts.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Search size={20} className="text-muted-foreground" />
          </div>
          <p className="font-semibold text-foreground mb-1">No clients found</p>
          <p className="text-sm text-muted-foreground">
            {search ? `No clients match "${search}".` : 'Add your first client to get started.'}
          </p>
          {!search && (
            <Button onClick={() => setAddOpen(true)} className="mt-4 gap-2" size="sm">
              <Plus size={14} /> Add client
            </Button>
          )}
        </div>
      )}

      {/* ── Card view — stage-grouped ── */}
      {!loading && contacts.length > 0 && view === 'card' && (
        <div className="grid gap-5 sm:grid-cols-3">
          {STAGES.map((stage) => {
            const stageContacts = contacts.filter((c) => c.type === stage.key);
            if (stageContacts.length === 0 && !search) return (
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
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {!loading && contacts.length > 0 && view === 'list' && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Preferences</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {contacts.map((contact) => {
                  const stage = STAGES.find((s) => s.key === contact.type)!;
                  return (
                    <tr key={contact.id} className="group hover:bg-muted/30 transition-colors">
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
                          {contact.email && <p className="text-xs text-muted-foreground truncate max-w-[180px]">{contact.email}</p>}
                          {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
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
}: {
  contact: Client;
  slug: string;
  onEdit: () => void;
  onDelete: () => void;
  stageClassName: string;
}) {
  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px">
      <div className="px-4 py-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2.5 min-w-0">
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
              <span className="truncate">{contact.phone}</span>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail size={10} className="flex-shrink-0" />
              <span className="truncate">{contact.email}</span>
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
