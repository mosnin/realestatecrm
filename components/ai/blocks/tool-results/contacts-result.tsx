'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Phone, Mail, ChevronRight, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';

interface ContactSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType?: 'rental' | 'buyer' | null;
  scoreLabel?: string | null;
  leadScore?: number | null;
  followUpAt?: string | null;
}

interface ContactsResultData {
  contacts: ContactSummary[];
}

const SCORE_TONE: Record<string, string> = {
  hot: 'text-orange-600 dark:text-orange-400',
  warm: 'text-amber-600 dark:text-amber-400',
  cold: 'text-muted-foreground',
};

/**
 * Inline rendering of `search_contacts` (and `get_contact`) tool results.
 * Each row is a clickable mini-card linking to the contact detail page.
 * Replaces the expandable JSON pane the generic tool-call view shows;
 * realtors don't need to read JSON, they need to click the contact.
 */
export function ContactsResult({ data }: { data: ContactsResultData }) {
  const params = useParams();
  const slug = params?.slug as string | undefined;
  const { contacts } = data;

  if (!contacts || contacts.length === 0) return null;

  return (
    <ul className="mt-2 divide-y divide-border/60 rounded-lg border border-border/60 bg-background overflow-hidden">
      {contacts.map((c) => {
        const overdue =
          c.followUpAt && new Date(c.followUpAt) < new Date() ? c.followUpAt : null;
        const scoreClass = c.scoreLabel ? SCORE_TONE[c.scoreLabel] : undefined;
        const href = slug ? `/s/${slug}/contacts/${c.id}` : '#';

        return (
          <li key={c.id}>
            <Link
              href={href}
              className="group/row flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-xs font-semibold text-muted-foreground">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-foreground truncate">{c.name}</span>
                  {c.scoreLabel && c.leadScore != null && (
                    <span className={cn('text-[11px] tabular-nums', scoreClass)}>
                      {c.scoreLabel} {Math.round(c.leadScore)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {c.leadType && <span>{c.leadType}</span>}
                  {overdue && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Clock size={10} />
                      follow-up overdue {timeAgo(overdue)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground/70 flex-shrink-0">
                {c.phone && <Phone size={11} />}
                {c.email && <Mail size={11} />}
                <ChevronRight
                  size={13}
                  className="ml-1 text-muted-foreground/0 group-hover/row:text-muted-foreground/60 transition-colors"
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
