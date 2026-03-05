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
import { Badge } from '@/components/ui/badge';
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
import type { Contact } from '@prisma/client';

const TYPE_COLORS: Record<string, string> = {
  BUYER: 'bg-blue-100 text-blue-700',
  SELLER: 'bg-green-100 text-green-700',
  AGENT: 'bg-purple-100 text-purple-700',
  OTHER: 'bg-gray-100 text-gray-700'
};

interface ContactTableProps {
  subdomain: string;
}

export function ContactTable({ subdomain }: ContactTableProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);

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
    if (!confirm('Delete this contact?')) return;
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    fetchContacts();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="BUYER">Buyer</SelectItem>
            <SelectItem value="SELLER">Seller</SelectItem>
            <SelectItem value="AGENT">Agent</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={16} className="mr-2" />
          Add Contact
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden sm:table-cell">Email</TableHead>
              <TableHead className="hidden md:table-cell">Phone</TableHead>
              <TableHead className="hidden lg:table-cell">Tags</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No contacts found. Add your first contact!
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
                      {contact.type}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                    {contact.email ?? '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                    {contact.phone ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
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
                        onClick={() => handleDelete(contact.id)}
                        className="text-destructive hover:text-destructive"
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

      <ContactForm
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleAdd}
      />
      {editContact && (
        <ContactForm
          open={!!editContact}
          onOpenChange={(o) => !o && setEditContact(null)}
          onSubmit={handleEdit}
          defaultValues={{
            name: editContact.name,
            email: editContact.email ?? '',
            phone: editContact.phone ?? '',
            address: editContact.address ?? '',
            notes: editContact.notes ?? '',
            type: editContact.type as any,
            tags: editContact.tags.join(', ')
          }}
          title="Edit Contact"
        />
      )}
    </div>
  );
}
