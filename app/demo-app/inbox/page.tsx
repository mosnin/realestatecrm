'use client';

/**
 * /demo-app/inbox - backend-free clone of /s/[slug]/communication.
 *
 * Pixel-for-pixel reproduction of the real Email tab (CommunicationView +
 * EmailInboxView) with the auth/Supabase/[slug] data layer replaced by the
 * hardcoded DEMO_INBOX array. The real EmailInboxView self-fetches from
 * /api/email and writes through to Gmail, so it can't be reused directly in a
 * backend-free surface - its markup is replicated here instead, reusing the
 * genuinely shared leaf primitives (Dialog, Input, Textarea, motion, lucide
 * icons, typography tokens) so the result is identical to the product.
 *
 * Everything that would touch the network is a no-op: compose Send, star
 * toggle, row open, filter change, search. Nothing here ever fetches.
 *
 * The one thing the real inbox doesn't show yet - and the reason this surface
 * exists - is that the top thread already has a Chippi reply written, sitting
 * ready for review before Jordan opens it. That draft renders inline on the
 * row using the same brand-orange vocabulary the rest of the app reserves for
 * Chippi moments.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Send,
  Star,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { EASE_APPLE } from '@/lib/motion';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  SECTION_LABEL,
  PRIMARY_PILL,
  CHIPPI_PILL,
  GHOST_PILL,
  CAPTION,
  META,
} from '@/lib/typography';
import { DEMO_INBOX, type DemoEmailItem } from './dummy-data';

type EmailFilter = 'inbox' | 'starred' | 'sent';

const FILTERS: { key: EmailFilter; label: string }[] = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'starred', label: 'Starred' },
  { key: 'sent', label: 'Sent' },
];

function formatRelative(iso: string): string {
  // Anchored to the demo's "now" so relative labels stay stable.
  const then = new Date(iso);
  const now = new Date('2026-06-04T12:00:00Z');
  const ms = now.getTime() - then.getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d`;
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function DemoInboxPage() {
  const [filter, setFilter] = useState<EmailFilter>('inbox');
  const [items, setItems] = useState<DemoEmailItem[]>(DEMO_INBOX);
  const [composeOpen, setComposeOpen] = useState(false);

  // Search state mirrors the real toolbar: a debounced query in the product,
  // but here filtering is local and instant - no network to debounce.
  const [searchInput, setSearchInput] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchQuery = searchInput.trim().toLowerCase();

  const clearSearch = useCallback(() => {
    setSearchInput('');
    searchInputRef.current?.focus();
  }, []);

  const handleFilterChange = useCallback((next: EmailFilter) => {
    setFilter(next);
    setSearchInput('');
  }, []);

  // No-op write-through: star toggles update local state only.
  const handleStarToggle = useCallback((id: string, nextStarred: boolean) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, starred: nextStarred } : it)),
    );
  }, []);

  // No-op open: mark read locally. The demo has no per-email route.
  const handleRowOpen = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, unread: false } : it)),
    );
  }, []);

  const visible = useMemo(() => {
    let rows = items;
    if (filter === 'starred') rows = rows.filter((r) => r.starred);
    // 'sent' has nothing in the demo inbox, which exercises the empty state.
    else if (filter === 'sent') rows = [];
    if (searchQuery) {
      rows = rows.filter((r) =>
        `${r.fromName} ${r.subject ?? ''} ${r.snippet}`
          .toLowerCase()
          .includes(searchQuery),
      );
    }
    return rows;
  }, [items, filter, searchQuery]);

  const subtitle = 'Reading from Gmail.';

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto chat-content-wrap pt-10 sm:pt-14 pb-56 md:pb-24 space-y-8 max-w-3xl">
        <header className="space-y-1.5 min-w-0">
          <p className={BODY_MUTED}>Communication.</p>
          <h1 className={H1} style={TITLE_FONT}>
            Your inbox, in here.
          </h1>
          <p className={BODY_MUTED}>{subtitle}</p>
        </header>

        <div className="space-y-5">
          {/* Toolbar: filter chips · search · New message */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <FilterChips value={filter} onChange={handleFilterChange} />

            <div className="relative flex-1 min-w-[160px] sm:min-w-[220px] max-w-xs">
              <Search
                size={14}
                strokeWidth={1.75}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70"
                aria-hidden
              />
              <Input
                ref={searchInputRef}
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    clearSearch();
                  }
                }}
                placeholder="Search mail"
                aria-label="Search mail"
                className="pl-9 pr-9 h-9 text-sm rounded-full"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors duration-150 p-0.5"
                >
                  <X size={13} strokeWidth={1.75} />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className={cn(PRIMARY_PILL, 'whitespace-nowrap shrink-0 ml-auto sm:ml-0')}
              aria-label="New message"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New message</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`feed-${filter}-${searchQuery}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE_APPLE }}
            >
              {visible.length === 0 ? (
                <EmptyFeed filter={filter} searchQuery={searchQuery} />
              ) : (
                <motion.ul
                  className="divide-y divide-border/60"
                  initial="initial"
                  animate="enter"
                  variants={{
                    initial: {},
                    enter: { transition: { staggerChildren: 0.03 } },
                  }}
                >
                  {visible.map((it) => (
                    <EmailRow
                      key={it.id}
                      item={it}
                      filter={filter}
                      onOpen={() => handleRowOpen(it.id)}
                      onToggleStar={() => handleStarToggle(it.id, !it.starred)}
                    />
                  ))}
                </motion.ul>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <ComposeDialog
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
        />
      </div>
    </div>
  );
}

function FilterChips({
  value,
  onChange,
}: {
  value: EmailFilter;
  onChange: (next: EmailFilter) => void;
}) {
  return (
    <div className="flex items-center gap-2 shrink-0" role="tablist" aria-label="Filter">
      {FILTERS.map((f, idx) => (
        <span key={f.key} className="flex items-center gap-2">
          {idx > 0 && <span className={BODY_MUTED}>·</span>}
          <button
            type="button"
            role="tab"
            aria-selected={value === f.key}
            onClick={() => onChange(f.key)}
            className={cn(
              'text-sm transition-colors duration-150',
              value === f.key
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        </span>
      ))}
    </div>
  );
}

/** Star icon with a one-shot scale pulse when value goes false → true. */
function StarPulse({
  starred,
  size = 15,
  className,
}: {
  starred: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <motion.span
      initial={false}
      animate={{ scale: 1 }}
      transition={{ duration: 0.18, ease: EASE_APPLE }}
      className="inline-flex"
    >
      <Star size={size} strokeWidth={1.75} className={className} />
    </motion.span>
  );
}

function EmailRow({
  item,
  filter,
  onOpen,
  onToggleStar,
}: {
  item: DemoEmailItem;
  filter: EmailFilter;
  onOpen: () => void;
  onToggleStar: () => void;
}) {
  const isSent = filter === 'sent';
  const displayName = isSent
    ? item.toName || item.toAddress || '(no recipient)'
    : item.fromName || item.fromAddress || '(unknown sender)';
  const displayAddress = isSent ? item.toAddress : item.fromAddress;

  const itemVariants = {
    initial: { opacity: 0, y: 8 },
    enter: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.24, ease: EASE_APPLE },
    },
  };

  return (
    <motion.li className="group/row" variants={itemVariants}>
      <div className="flex items-start gap-3 py-3">
        <span className="w-1.5 shrink-0 pt-2.5 flex items-center justify-center">
          <span
            className={cn(
              'block w-1.5 h-1.5 rounded-full transition-colors',
              item.unread ? 'bg-foreground' : 'bg-transparent',
            )}
            aria-hidden
          />
        </span>

        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left hover:bg-foreground/[0.02] transition-all duration-150 -my-1 py-1 rounded-sm hover:-translate-y-px active:scale-[0.98] active:translate-y-0"
        >
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-sm truncate',
                item.unread ? 'font-semibold text-foreground' : 'text-foreground',
              )}
            >
              {displayName}
            </span>
            {displayAddress && displayAddress !== displayName && (
              <span className={cn(CAPTION, 'truncate min-w-0')}>
                {displayAddress}
              </span>
            )}
            {item.chippiDraft && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/[0.06] px-2 py-0.5 text-[11px] font-medium text-orange-600">
                <MessageCircle size={11} strokeWidth={1.75} />
                Draft ready
              </span>
            )}
          </div>
          <p className={cn(CAPTION, 'mt-0.5 truncate')}>
            {item.subject ? (
              <>
                <span
                  className={cn(
                    item.unread ? 'text-foreground' : 'text-foreground/80',
                  )}
                >
                  {item.subject}
                </span>
                {item.snippet ? <span> &mdash; {item.snippet}</span> : null}
              </>
            ) : (
              item.snippet || ''
            )}
          </p>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar();
          }}
          aria-label={item.starred ? 'Unstar' : 'Star'}
          className={cn(
            'shrink-0 p-1 -m-1 rounded-md transition-opacity duration-150',
            item.starred
              ? 'opacity-100'
              : 'opacity-100 md:opacity-0 md:group-hover/row:opacity-100',
          )}
        >
          <StarPulse
            starred={item.starred}
            className={cn(
              'transition-colors duration-200',
              item.starred
                ? 'fill-amber-500 text-amber-500'
                : 'text-muted-foreground hover:text-foreground',
            )}
            size={15}
          />
        </button>

        <span className={cn(META, 'shrink-0 pt-1 tabular-nums')}>
          {formatRelative(item.sentAt)}
        </span>
      </div>

      {/* Chippi draft-review panel - the reply written before Jordan opened
       *  the email. Lives under the row in the brand-orange Chippi vocabulary,
       *  with Send / Edit / Discard. All three are no-ops in the demo. */}
      {item.chippiDraft && !isSent && (
        <ChippiDraftPanel draft={item.chippiDraft} />
      )}
    </motion.li>
  );
}

function ChippiDraftPanel({
  draft,
}: {
  draft: NonNullable<DemoEmailItem['chippiDraft']>;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_APPLE, delay: 0.12 }}
      className="ml-[18px] mb-3 rounded-xl border border-orange-500/25 bg-orange-500/[0.04] p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500/15 text-orange-600">
          <MessageCircle size={12} strokeWidth={2} />
        </span>
        <p className="text-[13px] font-medium text-foreground">
          Chippi wrote a reply for you.
        </p>
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
        {draft.body}
      </p>
      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={cn(CHIPPI_PILL)}
        >
          <Send className="h-4 w-4" />
          Send reply
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={cn(GHOST_PILL, 'border border-border/70')}
        >
          <Pencil size={14} strokeWidth={1.75} />
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={cn(GHOST_PILL)}
        >
          Discard
        </button>
        <span className={cn(CAPTION, 'ml-auto inline-flex items-center gap-1')}>
          <Check size={12} strokeWidth={2} className="text-orange-600" />
          Ready to send
        </span>
      </div>
    </motion.div>
  );
}

function EmptyFeed({
  filter,
  searchQuery,
}: {
  filter: EmailFilter;
  searchQuery: string;
}) {
  if (searchQuery) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
        <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
          <Search size={16} strokeWidth={1.75} className="text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No results.</p>
        <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
          Nothing matched that search. Try a different term.
        </p>
      </div>
    );
  }
  const title =
    filter === 'starred'
      ? 'Nothing starred yet.'
      : filter === 'sent'
        ? 'Nothing sent yet.'
        : 'Inbox is quiet.';
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 py-12 px-6 flex flex-col items-center text-center">
      <div className="mb-3 w-10 h-10 rounded-lg bg-foreground/[0.04] flex items-center justify-center">
        <Mail size={16} strokeWidth={1.75} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground max-w-[280px] leading-relaxed">
        Anything new will land here.
      </p>
    </div>
  );
}

/* Compose dialog - same markup as the real EmailInboxView modal, but Send is
 * a no-op (never hits the network). */

function ComposeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const canSubmit = useMemo(() => {
    if (!to.trim()) return false;
    if (!subject.trim()) return false;
    if (!body.trim()) return false;
    return true;
  }, [body, subject, to]);

  const handleSend = useCallback(() => {
    // No-op in the demo: clear and close, no network.
    setTo('');
    setCc('');
    setSubject('');
    setBody('');
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          'sm:max-w-xl duration-200',
          'data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98]',
          'data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-4',
          'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0',
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-foreground">
            New message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email-to" className={SECTION_LABEL}>
              To
            </Label>
            <Input
              id="email-to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="name@email.com"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-cc" className={SECTION_LABEL}>
              Cc{' '}
              <span className="font-normal lowercase tracking-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="email-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="name@email.com"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-subject" className={SECTION_LABEL}>
              Subject
            </Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email-body" className={SECTION_LABEL}>
              Message
            </Label>
            <Textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message&hellip;"
              rows={8}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={cn(GHOST_PILL)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSubmit}
              className={cn(PRIMARY_PILL, 'disabled:opacity-50')}
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
