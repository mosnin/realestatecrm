'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calendar, CheckCircle2, Phone, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FollowUpContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: string;
  followUpAt: string;
}

interface Props {
  slug: string;
  contacts: FollowUpContact[];
}

export function FollowUpWidget({ slug, contacts: initialContacts }: Props) {
  const [contacts, setContacts] = useState<FollowUpContact[]>(initialContacts);
  const [expanded, setExpanded] = useState(true);
  const [clearing, setClearing] = useState<Set<string>>(new Set());

  async function handleClearFollowUp(id: string) {
    setClearing((s) => new Set(s).add(id));
    try {
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followUpAt: null }),
      });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setClearing((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  if (contacts.length === 0) return null;

  const overdue = contacts.filter((c) => new Date(c.followUpAt) < new Date());

  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/5 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Calendar size={14} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Follow-ups due
            </p>
            <p className="text-xs text-amber-700/70 dark:text-amber-400/70">
              {overdue.length} overdue · {contacts.length} total
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={15} className="text-amber-600/60 dark:text-amber-400/60 flex-shrink-0" />
        ) : (
          <ChevronDown size={15} className="text-amber-600/60 dark:text-amber-400/60 flex-shrink-0" />
        )}
      </button>

      {/* Contact rows */}
      {expanded && (
        <div className="border-t border-amber-200/70 dark:border-amber-500/20 divide-y divide-amber-100 dark:divide-amber-500/10">
          {contacts.map((contact) => {
            const date = new Date(contact.followUpAt);
            const isOverdue = date < new Date();
            const isBusy = clearing.has(contact.id);
            return (
              <div
                key={contact.id}
                className={cn(
                  'flex items-center gap-3 px-5 py-3 transition-opacity',
                  isBusy && 'opacity-50'
                )}
              >
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-700 dark:text-amber-300 font-semibold text-xs flex-shrink-0">
                  {contact.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/s/${slug}/contacts/${contact.id}`}
                    className="text-sm font-medium hover:text-primary transition-colors truncate block"
                  >
                    {contact.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {contact.phone && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Phone size={10} /> {contact.phone}
                      </span>
                    )}
                    {contact.email && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground truncate max-w-[150px]">
                        <Mail size={10} /> {contact.email}
                      </span>
                    )}
                  </div>
                </div>

                {/* Date + clear */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={cn(
                      'text-[11px] font-semibold rounded-full px-2 py-0.5',
                      isOverdue
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
                    )}
                  >
                    {isOverdue ? 'Overdue' : 'Due'}{' '}
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    type="button"
                    title="Mark done"
                    disabled={isBusy}
                    onClick={() => handleClearFollowUp(contact.id)}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-500/15 transition-colors"
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
