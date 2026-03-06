'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ContactForm } from './contact-form';
import { Plus, Search, Trash2, Pencil } from 'lucide-react';
import Link from 'next/link';

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

const TYPE_COLORS: Record<string, string> = {
  QUALIFICATION: 'bg-blue-500/20 text-blue-400',
  TOUR: 'bg-amber-500/20 text-amber-400',
  APPLICATION: 'bg-green-500/20 text-green-400'
};

interface ContactTableProps {
  subdomain: string;
}

function formatType(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function formatCurrency(value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

export function ContactTable({ subdomain }: ContactTableProps) {
  const [contacts, setContacts] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Client | null>(null);

  const fetchContacts = useCallback(async () => {
    const params = new URLSearchParams({ subdomain, search, type: typeFilter });
    const res = await fetch(`/api/contacts?${params}`);
    if (res.ok) setContacts(await res.json());
  }, [subdomain, search, typeFilter]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  async function handleAdd(data: any) {
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, subdomain })
    });
    fetchContacts();
  }

  async function handleEdit(data: any) {
    if (!editContact) return;
    await fetch(`/api/contacts/${editContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    setEditContact(null);
    fetchContacts();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this client?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    fetchContacts();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="QUALIFICATION">Qualification</SelectItem>
            <SelectItem value="TOUR">Tour</SelectItem>
            <SelectItem value="APPLICATION">Application</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} className="mr-2" />
          Add Client
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Email</TableHead>
              <TableHead className="hidden xl:table-cell">Budget</TableHead>
              <TableHead className="hidden xl:table-cell">Date Joined</TableHead>
              <TableHead className="hidden 2xl:table-cell">Preferences</TableHead>
              <TableHead className="hidden 2xl:table-cell">Properties</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No clients found. Add your first client!
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link
                      href={`/s/${subdomain}/contacts/${contact.id}`}
                      className="font-medium hover:underline"
                    >
                      {contact.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[contact.type]}`}
                    >
                      {formatType(contact.type)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {contact.phone ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                    {contact.email ?? '—'}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-muted-foreground text-sm">
                    {formatCurrency(contact.budget)}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-muted-foreground text-sm">
                    {new Date(contact.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="hidden 2xl:table-cell text-muted-foreground text-sm max-w-52 truncate">
                    {contact.preferences ?? '—'}
                  </TableCell>
                  <TableCell className="hidden 2xl:table-cell text-muted-foreground text-sm max-w-52 truncate">
                    {contact.properties.length ? contact.properties.join(', ') : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditContact(contact)}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDelete(contact.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
                tags: editContact.tags.join(', ')
              }
            : undefined
        }
      />
    </div>
  );
}
