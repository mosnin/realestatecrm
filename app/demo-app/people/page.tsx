'use client';

/**
 * /demo-app/people — backend-free clone of the real contacts surface
 * (app/s/[slug]/contacts/page.tsx).
 *
 * The real page renders <ContactTable>. We REPLICATE ContactTable's
 * markup here because the real one self-fetches from /api/contacts on mount —
 * a network call this demo must not make. Every fetch / add / edit / delete /
 * import / compare write path is stripped; all read-side interactivity
 * (search, filters, sort, list/grid toggle, select mode) is kept so the
 * surface looks and behaves identically without a backend.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Trash2,
  Pencil,
  Phone,
  Mail,
  Wallet,
  MapPin,
  LayoutGrid,
  List,
  Download,
  Upload,
  Bookmark,
  X,
  CheckSquare,
  GitCompare,
  CalendarDays,
  MoreHorizontal,
  Inbox,
  Mic,
  Tag as TagIcon,
  ChevronRight,
} from 'lucide-react';
import { BODY_MUTED, H1, TITLE_FONT } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { formatCurrency as _formatCurrency, getInitials } from '@/lib/formatting';
import { CONTACT_STAGES } from '@/lib/constants';
import { motion } from 'framer-motion';
import { EASE_APPLE } from '@/lib/motion';
import {
  DEMO_CONTACTS,
  type DemoClient,
} from './dummy-data';

type Client = DemoClient;

const STAGES = CONTACT_STAGES;

function formatCurrency(value: number | null) {
  if (value == null) return null;
  return _formatCurrency(value);
}

/**
 * Lead-score → tier. Thresholds mirror lib/dynamic-lead-scoring.ts
 * (>=75 hot, >=45 warm, else cold). Null/unscored returns null so the card
 * renders nothing rather than a misleading zero.
 */
function scoreTier(
  score: number | null,
): { label: string; dot: string; text: string } | null {
  if (score == null || score <= 0) return null;
  if (score >= 75) return { label: 'Hot', dot: 'bg-lead-hot', text: 'text-lead-hot' };
  if (score >= 45) return { label: 'Warm', dot: 'bg-lead-warm', text: 'text-lead-warm' };
  return { label: 'Cold', dot: 'bg-lead-cold', text: 'text-lead-cold' };
}

/**
 * Lead-score chip — a tier dot + the score, scannable at a glance.
 */
function ScoreChip({ score }: { score: number | null }) {
  const tier = scoreTier(score);
  if (!tier) return null;
  return (
    <span
      className="inline-flex items-center gap-1 flex-shrink-0"
      title={`${tier.label} lead · score ${score}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tier.dot)} aria-hidden />
      <span className={cn('text-[11px] font-semibold tabular-nums', tier.text)}>
        {score}
      </span>
    </span>
  );
}

export default function DemoPeoplePage() {
  return (
    <div className="p-4 md:p-6">
      <DemoContactTable />
    </div>
  );
}

function DemoContactTable() {
  // Contacts are pre-loaded — no fetch, no loading/error states.
  const [contacts] = useState<Client[]>(DEMO_CONTACTS);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [leadTypeFilter, setLeadTypeFilter] = useState<'all' | 'new' | 'rental' | 'buyer'>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [tagPopoverSearch, setTagPopoverSearch] = useState('');
  const [sortBy, setSortBy] = useState<
    'newest' | 'oldest' | 'name-az' | 'name-za' | 'agent-priority'
  >('agent-priority');
  const [view, setView] = useState<'card' | 'list'>('list');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Leaving Select mode clears the active selection — no orphaned state.
  useEffect(() => {
    if (!selectMode) setSelectedIds(new Set());
  }, [selectMode]);

  // Esc clears the selection AND exits Select mode.
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

  // Unique user-defined tags (exclude system tags)
  const SYSTEM_TAGS = new Set(['application-link', 'new-lead']);
  const allTags = Array.from(
    new Set(contacts.flatMap((c) => c.tags.filter((t) => !SYSTEM_TAGS.has(t)))),
  ).sort();

  // Apply search + stage + tag + leadType filters and sorting client-side.
  // (The real table pushes search/stage to the API; the demo does the same
  // cut locally so typing in the box actually filters.)
  const visibleContacts = (() => {
    const q = search.trim().toLowerCase();
    let list = contacts
      .filter((c) => typeFilter === 'ALL' || c.type === typeFilter)
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false) ||
          (c.phone?.toLowerCase().includes(q) ?? false)
        );
      })
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

  const leadTypeChips: {
    key: 'all' | 'new' | 'rental' | 'buyer';
    label: string;
    count: number;
  }[] = [
    { key: 'all', label: 'All', count: contacts.length },
    { key: 'new', label: 'New', count: contacts.filter((c) => c.tags.includes('new-lead')).length },
    { key: 'rental', label: 'Rental', count: contacts.filter((c) => c.leadType === 'rental').length },
    { key: 'buyer', label: 'Buyer', count: contacts.filter((c) => c.leadType === 'buyer').length },
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

  // Subtitle copy — one quiet sentence, count-aware.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeekCount = contacts.filter(
    (c) => new Date(c.createdAt).getTime() >= weekAgo,
  ).length;
  const subtitle = (() => {
    if (contacts.length === 0) return null;
    const noun = contacts.length === 1 ? 'contact' : 'contacts';
    if (newThisWeekCount > 0) {
      return `${contacts.length} ${noun} · ${newThisWeekCount} new this week.`;
    }
    return `${contacts.length} ${noun}.`;
  })();

  return (
    <div className="space-y-6">
      {/* Header — muted greeting, serif Times h1, one-sentence status. */}
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>People.</p>
        <h1 className={H1} style={TITLE_FONT}>
          Your relationships
        </h1>
        {subtitle && <p className={BODY_MUTED}>{subtitle}</p>}
      </header>

      {/* Lead-type chip strip — underline tabs. */}
      {contacts.length > 0 && (
        <div
          role="tablist"
          aria-label="Filter people"
          className="flex items-center gap-5 border-b border-border/70 -mt-1"
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
                  'relative inline-flex items-center gap-1.5 pb-2.5 pt-0.5 text-sm transition-colors duration-150 ease-out -mb-px',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground font-normal',
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    'tabular-nums text-[11px] rounded-full px-1.5 py-0.5 transition-colors duration-150 ease-out',
                    active
                      ? 'bg-foreground/[0.06] text-foreground/70'
                      : 'bg-foreground/[0.04] text-muted-foreground',
                  )}
                >
                  {chip.count}
                </span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 right-0 -bottom-px h-[2px] rounded-full bg-foreground"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ONE filter row — search · stage · tag · sort · view · select · overflow. */}
      {contacts.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 sm:flex-initial min-w-[160px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              placeholder="Search…"
              className="pl-9 h-9 w-full sm:w-64 bg-background border-border/70"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="ml-auto flex items-center gap-2 flex-wrap">
            {/* Stage filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
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
              <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium transition-colors hover:bg-foreground/[0.04]',
                      tagFilter ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <TagIcon
                      size={12}
                      className={tagFilter ? 'text-foreground' : 'text-muted-foreground'}
                    />
                    {tagFilter ? (
                      <>
                        <span className="truncate max-w-[160px]">{tagFilter}</span>
                        <span
                          role="button"
                          aria-label="Clear tag filter"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTagFilter('');
                          }}
                          className="ml-0.5 -mr-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm hover:bg-foreground/10"
                        >
                          <X size={10} />
                        </span>
                      </>
                    ) : (
                      'Tag'
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-0">
                  <div className="border-b border-border/60 px-2 py-1.5">
                    <Input
                      value={tagPopoverSearch}
                      onChange={(e) => setTagPopoverSearch(e.target.value)}
                      placeholder="Search tags…"
                      className="h-8 border-0 shadow-none focus-visible:ring-0 text-xs px-1"
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
                              'w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-foreground/[0.04]',
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
            )}

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border/70 bg-background text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
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

            {/* View toggle */}
            <div className="flex rounded-md border border-border/70 overflow-hidden bg-background flex-shrink-0">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="List view"
                aria-pressed={view === 'list'}
                className={cn(
                  'h-9 w-9 flex items-center justify-center transition-colors',
                  view === 'list'
                    ? 'bg-foreground/[0.045] text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView('card')}
                aria-label="Grid view"
                aria-pressed={view === 'card'}
                className={cn(
                  'h-9 w-9 flex items-center justify-center transition-colors',
                  view === 'card'
                    ? 'bg-foreground/[0.045] text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
                )}
              >
                <LayoutGrid size={14} />
              </button>
            </div>

            {/* Select-mode toggle */}
            <button
              type="button"
              onClick={() => setSelectMode((s) => !s)}
              aria-pressed={selectMode}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-xs font-medium transition-colors',
                selectMode
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-background border-border/70 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]',
              )}
            >
              <CheckSquare size={12} />
              {selectMode ? 'Done' : 'Select'}
            </button>

            {/* Overflow */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More options"
                  className="h-9 w-9 flex items-center justify-center rounded-md border border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <MoreHorizontal size={14} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <Bookmark size={12} />
                  Save view
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Upload size={12} />
                  Import
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download size={12} />
                  Export
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Empty state — filter/search produced no matches. */}
      {visibleContacts.length === 0 && (() => {
        const hasStageFilter = typeFilter !== 'ALL';
        const hasLeadTypeFilter = leadTypeFilter !== 'all';
        const hasTagFilter = !!tagFilter;
        const hasAnyFilter = hasStageFilter || hasLeadTypeFilter || hasTagFilter;
        const isSearchOrFilterCase = !!search || hasTagFilter;
        const clearAllFilters = () => {
          setTypeFilter('ALL');
          setLeadTypeFilter('all');
          setTagFilter('');
        };

        if (isSearchOrFilterCase) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
                <Search size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
              </div>
              <p className="text-xl tracking-tight font-semibold text-foreground mb-1">
                No matches.
              </p>
              <p className="text-sm text-muted-foreground">
                Try a shorter query or clear filters.
              </p>
              {hasAnyFilter && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                >
                  <X size={13} /> Clear filters
                </button>
              )}
            </div>
          );
        }

        return (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-foreground/[0.04] flex items-center justify-center mb-4">
              <Inbox size={20} className="text-muted-foreground/60" strokeWidth={1.5} />
            </div>
            <p className="text-xl tracking-tight font-semibold text-foreground mb-1">
              Nothing in this view.
            </p>
            <p className="text-sm text-muted-foreground">
              Adjust the current filters to see more.
            </p>
            {hasAnyFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-4 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </div>
        );
      })()}

      {/* Card view — stage-grouped. */}
      {visibleContacts.length > 0 && view === 'card' && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STAGES.map((stage) => {
            const stageContacts = visibleContacts.filter((c) => c.type === stage.key);
            if (stageContacts.length === 0 && !search && !tagFilter) {
              return (
                <div
                  key={stage.key}
                  className={cn(
                    'rounded-lg border-2 border-dashed p-4 flex flex-col items-center justify-center min-h-[120px] text-center gap-2',
                    stage.border,
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', stage.dotColor)} />
                  <p className="text-xs font-semibold text-muted-foreground">
                    {stage.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60">
                    {stage.description}
                  </p>
                </div>
              );
            }
            if (stageContacts.length === 0) return null;
            return (
              <div key={stage.key} className="flex flex-col gap-2">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2',
                    stage.headerBg,
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full flex-shrink-0', stage.dotColor)} />
                  <span className="text-xs font-semibold text-foreground">{stage.label}</span>
                  <span
                    className={cn(
                      'ml-auto text-[11px] font-semibold rounded-md px-1.5 py-0.5',
                      stage.className,
                    )}
                  >
                    {stageContacts.length}
                  </span>
                </div>
                {stageContacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    selectMode={selectMode}
                    selected={selectedIds.has(contact.id)}
                    onToggleSelect={() => toggleSelect(contact.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* List view — divide-y row vocabulary. */}
      {visibleContacts.length > 0 && view === 'list' && (
        <div>
          {selectMode && (
            <div className="flex items-center gap-3 pb-2 border-b border-border/60 mb-1">
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
          )}

          <ul className="divide-y divide-border/60">
            {visibleContacts.map((contact, idx) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                idx={idx}
                selectMode={selectMode}
                selected={selectedIds.has(contact.id)}
                onToggleSelect={() => toggleSelect(contact.id)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Bulk-action bar — only when something is selected. */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] mx-auto w-fit z-30 flex items-center flex-wrap gap-2 rounded-lg border border-border/70 bg-card px-3 sm:px-4 py-2 sm:py-3 max-w-[calc(100vw-2rem)]">
          <CheckSquare size={14} className="text-foreground" />
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border mx-1" />
          <Select>
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
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs hidden sm:inline-flex"
            >
              <GitCompare size={12} />
              Compare
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Download size={12} />
            Export
          </Button>
          <Button size="sm" variant="destructive" className="h-8 text-xs">
            Delete
          </Button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ContactRow — canonical divide-y row vocabulary ────────────────────────

function ContactRow({
  contact,
  idx,
  selectMode,
  selected,
  onToggleSelect,
}: {
  contact: Client;
  idx: number;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const stage = STAGES.find((s) => s.key === contact.type)!;
  const shouldAnimate = idx < 10;
  const delay = shouldAnimate ? idx * 0.03 : 0;
  const pillDelay = shouldAnimate ? delay + 0.05 : 0;
  const followUpDate = contact.followUpAt ? new Date(contact.followUpAt) : null;
  const followUpOverdue = followUpDate ? followUpDate < new Date() : false;

  const body = (
    <>
      <div className="w-8 h-8 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
        {getInitials(contact.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-foreground truncate">
            {contact.name}
          </span>
          <motion.span
            initial={shouldAnimate ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18, ease: EASE_APPLE, delay: pillDelay }}
            className={cn(
              'inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0',
              stage.className,
            )}
          >
            {stage.label}
          </motion.span>
        </div>
        {(contact.email || contact.phone) && (
          <div className="mt-0.5 text-xs text-muted-foreground truncate">
            {contact.email && <span>{contact.email}</span>}
            {contact.email && contact.phone && (
              <span className="text-muted-foreground/40"> · </span>
            )}
            {contact.phone && <span className="tabular-nums">{contact.phone}</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ScoreChip score={contact.leadScore} />
        {followUpDate && (
          <span
            className={cn(
              'hidden sm:inline-flex items-center gap-1 text-[11px] font-medium rounded px-1.5 py-0.5',
              followUpOverdue
                ? 'text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/15'
                : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15',
            )}
          >
            <CalendarDays size={10} />
            {followUpDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {!selectMode && (
          <>
            <div className="hidden lg:flex gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <span
                aria-label={`Log a note for ${contact.name}`}
                title="Log a note"
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Mic size={13} />
              </span>
              <span
                aria-label={`Edit ${contact.name}`}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <Pencil size={13} />
              </span>
              <span
                aria-label={`Delete ${contact.name}`}
                className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 size={13} />
              </span>
            </div>
            <ChevronRight
              size={14}
              className="lg:hidden text-muted-foreground/40 flex-shrink-0"
              aria-hidden
            />
          </>
        )}
      </div>
    </>
  );

  const rowClassName = cn(
    'group/row flex items-center gap-3 py-3 px-2 -mx-2 rounded-md transition-colors',
    selected ? 'bg-muted/40' : 'hover:bg-muted/30',
  );

  return (
    <motion.li
      initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_APPLE, delay }}
    >
      {selectMode ? (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-pressed={selected}
          className={cn(rowClassName, 'w-full text-left cursor-pointer')}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${contact.name}`}
            className="rounded border-border cursor-pointer flex-shrink-0"
          />
          {body}
        </button>
      ) : (
        <Link href="/demo-app/people" className={rowClassName}>
          {body}
        </Link>
      )}
    </motion.li>
  );
}

// ─── Card view sub-component ────────────────────────────────────────────────

function ContactCard({
  contact,
  selectMode,
  selected,
  onToggleSelect,
}: {
  contact: Client;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div
      className={cn(
        'group rounded-lg border bg-card overflow-hidden transition-colors duration-150 hover:bg-muted/30',
        selected ? 'border-border bg-muted/40' : 'border-border/70',
      )}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {selectMode && (
              <input
                type="checkbox"
                checked={selected}
                onChange={onToggleSelect}
                onClick={(e) => e.stopPropagation()}
                className="rounded border-border cursor-pointer flex-shrink-0 mt-0.5"
                aria-label={`Select ${contact.name}`}
              />
            )}
            <div className="w-8 h-8 rounded-full bg-muted/40 text-muted-foreground flex items-center justify-center text-xs font-semibold flex-shrink-0">
              {getInitials(contact.name)}
            </div>
            <div className="min-w-0">
              <Link
                href="/demo-app/people"
                className="font-semibold text-sm hover:text-foreground transition-colors truncate block leading-tight"
              >
                {contact.name}
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ScoreChip score={contact.leadScore} />
            {!selectMode && (
              <div className="flex gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={`Edit ${contact.name}`}
                >
                  <Pencil size={12} />
                </span>
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label={`Delete ${contact.name}`}
                >
                  <Trash2 size={12} />
                </span>
              </div>
            )}
          </div>
        </div>

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
              <span>
                {formatCurrency(contact.budget)}
                {contact.leadType === 'rental' ? '/mo' : ''}
              </span>
            </div>
          )}
          {contact.preferences && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin size={10} className="flex-shrink-0" />
              <span className="truncate">{contact.preferences}</span>
            </div>
          )}
          {contact.followUpAt && (
            <div
              className={cn(
                'flex items-center gap-1.5 text-xs font-medium',
                new Date(contact.followUpAt) < new Date()
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400',
              )}
            >
              <CalendarDays size={10} className="flex-shrink-0" />
              <span>
                {new Date(contact.followUpAt) < new Date() ? 'Overdue' : 'Due'}{' '}
                {new Date(contact.followUpAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
