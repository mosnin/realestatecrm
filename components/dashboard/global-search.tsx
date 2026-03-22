'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, Users, Briefcase, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  scoreLabel: string | null;
}

interface DealResult {
  id: string;
  title: string;
  address: string | null;
  value: number | null;
  status: string;
  stage: { name: string; color: string } | null;
}

const SCORE_COLORS: Record<string, string> = {
  hot: 'text-emerald-600',
  warm: 'text-amber-600',
  cold: 'text-slate-500',
};

interface Props {
  slug: string;
}

export function GlobalSearch({ slug }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [deals, setDeals] = useState<DealResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery('');
      setContacts([]);
      setDeals([]);
      setError(null);
      setCursor(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setContacts([]); setDeals([]); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?slug=${slug}&q=${encodeURIComponent(q)}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('[GlobalSearch] API error:', res.status, text);
        setError(`Search failed (${res.status})`);
        return;
      }
      const data = await res.json();
      setContacts(data.contacts ?? []);
      setDeals(data.deals ?? []);
      setCursor(0);
    } catch (err) {
      console.error('[GlobalSearch] fetch error:', err);
      setError('Search unavailable');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  const allResults = [
    ...contacts.map((c) => ({ type: 'contact' as const, id: c.id, label: c.name, sub: c.email ?? c.phone ?? c.type, href: `/s/${slug}/contacts/${c.id}`, scoreLabel: c.scoreLabel })),
    ...deals.map((d) => ({ type: 'deal' as const, id: d.id, label: d.title, sub: d.stage?.name ?? d.status, href: `/s/${slug}/deals/${d.id}`, scoreLabel: null })),
  ];

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, allResults.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && allResults[cursor]) { navigate(allResults[cursor].href); }
  }

  const modal = open && mounted ? createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-lg mx-4 rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={15} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search contacts and deals…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-2">
          {loading && (
            <p className="text-center text-xs text-muted-foreground py-6">Searching…</p>
          )}
          {!loading && error && (
            <p className="text-center text-xs text-destructive py-6">{error}</p>
          )}
          {!loading && !error && query.length >= 2 && allResults.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-6">No results for &ldquo;{query}&rdquo;</p>
          )}
          {!loading && !error && query.length < 2 && (
            <p className="text-center text-xs text-muted-foreground py-6">Type at least 2 characters</p>
          )}

          {!loading && contacts.length > 0 && (
            <div>
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Contacts</p>
              {contacts.map((c, i) => {
                const idx = i;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => navigate(`/s/${slug}/contacts/${c.id}`)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                      cursor === idx ? 'bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? c.type}</p>
                    </div>
                    {c.scoreLabel && c.scoreLabel !== 'unscored' && (
                      <span className={cn('text-xs font-semibold', SCORE_COLORS[c.scoreLabel] ?? 'text-muted-foreground')}>
                        {c.scoreLabel}
                      </span>
                    )}
                    <Users size={12} className="text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {!loading && deals.length > 0 && (
            <div>
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Deals</p>
              {deals.map((d, i) => {
                const idx = contacts.length + i;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => navigate(`/s/${slug}/deals/${d.id}`)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                      cursor === idx ? 'bg-accent' : 'hover:bg-accent/50'
                    )}
                  >
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      {d.stage ? (
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.stage.color }} />
                      ) : (
                        <Briefcase size={12} className="text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{d.stage?.name ?? d.status}</p>
                    </div>
                    {d.value != null && (
                      <span className="text-xs text-muted-foreground">${d.value.toLocaleString()}</span>
                    )}
                    <Briefcase size={12} className="text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 px-2 sm:px-3 rounded-lg border border-border bg-muted/60 hover:bg-muted text-muted-foreground text-xs transition-colors"
      >
        <Search size={12} />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
          ⌘K
        </kbd>
      </button>

      {/* Portal-rendered modal */}
      {modal}
    </>
  );
}
