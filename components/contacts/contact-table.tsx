'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Plus, Search, Trash2, Pencil, Phone, Mail, Wallet, MapPin, Calendar, ArrowUpDown } from 'lucide-react';
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

type SortKey = 'newest' | 'oldest' | 'name-asc' | 'name-desc' | 'budget-high' | 'budget-low';

const TYPE_META: Record<string, { label: string; className: string }> = {
  QUALIFICATION: { label: 'Qualifying', className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400' },
  TOUR:          { label: 'Tour',       className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  APPLICATION:   { label: 'Applied',   className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-400' },
};

function formatCurrency(v: number | null) {
  if (v == null) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function sortContacts(contacts: Client[], key: SortKey): Client[] {
  return [...contacts].sort((a, b) => {
    switch (key) {
      case 'newest':      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name-asc':    return a.name.localeCompare(b.name);
      case 'name-desc':   return b.name.localeCompare(a.name);
      case 'budget-high': return (b.budget ?? 0) - (a.budget ?? 0);
      case 'budget-low':  return (a.budget ?? 0) - (b.budget ?? 0);
      default:            return 0;
    }
  });
}

export function ContactTable({ subdomain }: { subdomain: string }) {
  const [contacts, setContacts]       = useState<Client[]>([]);
  const [search, setSearch]           = useState('');
  const [typeFilter, setTypeFilter]   = useState('ALL');
  const [sortKey, setSortKey]         = useState<SortKey>('newest');
  const [addOpen, setAddOpen]         = useState(false);
  const [editContact, setEditContact] = useState<Client | null>(null);
  const [loading, setLoading]         = useState(true);

  const fetchContacts = useCallback(async () => {
    const params = new URLSearchParams({ subdomain, search, type: typeFilter });
    const res = await fetch(`/api/contacts?${params}`);
    if (res.ok) setContacts(await res.json());
    setLoading(false);
  }, [subdomain, search, typeFilter]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const sorted = useMemo(() => sortContacts(contacts, sortKey), [contacts, sortKey]);

  async function handleAdd(data: any) {
    await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, subdomain }) });
    fetchContacts();
  }

  async function handleEdit(data: any) {
    if (!editContact) return;
    await fetch(`/api/contacts/${editContact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    setEditContact(null);
    fetchContacts();
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this client?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    fetchContacts();
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, phone..."
            className="pl-9 bg-card"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-36 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All stages</SelectItem>
              <SelectItem value="QUALIFICATION">Qualifying</SelectItem>
              <SelectItem value="TOUR">Tour</SelectItem>
              <SelectItem value="APPLICATION">Applied</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-44 bg-card">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1.5 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <ArrowUpDown size={11} /> Sort by
              </div>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="name-asc">Name A → Z</SelectItem>
              <SelectItem value="name-desc">Name Z → A</SelectItem>
              <SelectItem value="budget-high">Budget: high → low</SelectItem>
              <SelectItem value="budget-low">Budget: low → high</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={() => setAddOpen(true)} className="gap-2 flex-shrink-0">
            <Plus size={15} />
            Add client
          </Button>
        </div>
      </div>

      {/* Count line */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          {sorted.length} {sorted.length === 1 ? 'client' : 'clients'}
          {typeFilter !== 'ALL' ? ` · ${TYPE_META[typeFilter]?.label ?? typeFilter}` : ''}
        </p>
      )}

      {/* Cards */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      ) : sorted.length === 0 ? (
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
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((contact) => {
            const meta = TYPE_META[contact.type];
            return (
              <div
                key={contact.id}
                className="group rounded-xl border border-border bg-card overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-px flex flex-col"
              >
                <div className="px-4 pt-4 pb-3 flex-1">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary flex-shrink-0">
                        {getInitials(contact.name)}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/s/${subdomain}/contacts/${contact.id}`}
                          className="font-semibold text-sm hover:text-primary transition-colors truncate block"
                        >
                          {contact.name}
                        </Link>
                        <span className={cn('inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 mt-1', meta.className)}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button type="button" onClick={() => setEditContact(contact)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button type="button" onClick={() => handleDelete(contact.id)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-1.5">
                    {contact.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone size={11} className="flex-shrink-0" /><span className="truncate">{contact.phone}</span>
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail size={11} className="flex-shrink-0" /><span className="truncate">{contact.email}</span>
                      </div>
                    )}
                    {contact.budget != null && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Wallet size={11} className="flex-shrink-0" /><span>{formatCurrency(contact.budget)}/mo</span>
                      </div>
                    )}
                    {contact.preferences && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin size={11} className="flex-shrink-0" /><span className="truncate">{contact.preferences}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: submission date + tag */}
                <div className="px-4 py-2 border-t border-border/60 bg-muted/20 flex items-center gap-1.5">
                  <Calendar size={10} className="text-muted-foreground/60 flex-shrink-0" />
                  <span className="text-[10px] text-muted-foreground/70">{formatDate(contact.createdAt)}</span>
                  {contact.tags.includes('multi-step-application') && (
                    <span className="ml-auto text-[9px] font-medium text-primary/80 bg-primary/10 rounded-full px-1.5 py-0.5 leading-none">
                      Full app
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ContactForm open={addOpen} onOpenChange={setAddOpen} onSubmit={handleAdd} title="Add Client" />
      <ContactForm
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
        onSubmit={handleEdit}
        title="Edit Client"
        defaultValues={
          editContact ? {
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
          } : undefined
        }
      />
    </div>
  );
}
