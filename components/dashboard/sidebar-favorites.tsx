'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Plus, Star, GripVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SECTION_LABEL } from '@/lib/typography';

// ─────────────────────────────────────────────────────────────────────────────
// SidebarFavorites — a realtor-curated list of pages they keep close. Storage
// is purely client-side (localStorage per workspace slug). No DB table, no API
// route. v1 is intentionally minimal: collapsible header, list of rows, an
// inline input to add a new favorite, and a delete affordance on hover.
//
// Storage shape: `chippi:sidebar:favorites:${slug}` → JSON array of
//   { id: string; label: string; href: string; icon?: string }
//
// `href` is a path relative to the workspace base (e.g. `/contacts/123`); the
// renderer prefixes `${base}` so the same favorite still resolves if the slug
// shifts. Realtors who paste an absolute URL get the URL stored as-is — the
// `startsWith('/')` branch decides whether to prefix.
// ─────────────────────────────────────────────────────────────────────────────

export interface FavoriteEntry {
  id: string;
  label: string;
  href: string;
  icon?: string;
}

const STORAGE_PREFIX = 'chippi:sidebar:favorites:';

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

function loadFavorites(slug: string): FavoriteEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FavoriteEntry =>
        e && typeof e.id === 'string' && typeof e.label === 'string' && typeof e.href === 'string',
    );
  } catch {
    return [];
  }
}

function saveFavorites(slug: string, list: FavoriteEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(list));
  } catch {
    // Quota / private mode — silently degrade.
  }
}

interface SidebarFavoritesProps {
  slug: string;
  /** Workspace base path — favorites with relative hrefs prefix from here. */
  base: string;
  /** When true, hide entirely (collapsed-rail mode). */
  collapsed?: boolean;
  /** Optional callback on row click (e.g. close mobile drawer). */
  onNavigate?: () => void;
}

export function SidebarFavorites({ slug, base, collapsed = false, onNavigate }: SidebarFavoritesProps) {
  const [expanded, setExpanded] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftHref, setDraftHref] = useState('');

  // Hydrate from localStorage on mount.
  useEffect(() => {
    setFavorites(loadFavorites(slug));
  }, [slug]);

  const commitFavorite = useCallback(() => {
    const label = draftLabel.trim();
    const hrefRaw = draftHref.trim();
    if (!label || !hrefRaw) {
      setAdding(false);
      setDraftLabel('');
      setDraftHref('');
      return;
    }
    const entry: FavoriteEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      href: hrefRaw.startsWith('http') || hrefRaw.startsWith('/') ? hrefRaw : `/${hrefRaw}`,
    };
    setFavorites((prev) => {
      const next = [...prev, entry];
      saveFavorites(slug, next);
      return next;
    });
    setAdding(false);
    setDraftLabel('');
    setDraftHref('');
  }, [draftLabel, draftHref, slug]);

  const removeFavorite = useCallback(
    (id: string) => {
      setFavorites((prev) => {
        const next = prev.filter((f) => f.id !== id);
        saveFavorites(slug, next);
        return next;
      });
    },
    [slug],
  );

  if (collapsed) return null;

  // Resolve the href for the Link. If the favorite stored an absolute URL or
  // a path starting with /broker, /s, etc., trust it; otherwise prefix with
  // the workspace base so a "Lead: Jane" favorite still lands on the right
  // workspace when the slug shifts.
  const resolveHref = (raw: string): string => {
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    if (raw.startsWith('/s/') || raw.startsWith('/broker') || raw.startsWith('/login') || raw.startsWith('/setup')) {
      return raw;
    }
    return `${base}${raw.startsWith('/') ? raw : `/${raw}`}`;
  };

  return (
    <div className="px-3 pt-4">
      <div className="flex items-center justify-between pb-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            SECTION_LABEL,
            'inline-flex items-center gap-1 px-0 hover:text-foreground transition-colors',
          )}
          aria-expanded={expanded}
          aria-controls="sidebar-favorites-list"
        >
          <ChevronDown
            size={11}
            strokeWidth={2}
            className={cn(
              'transition-transform ease-out',
              expanded ? '' : '-rotate-90',
            )}
          />
          Favorites
        </button>
        {expanded && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add favorite"
            className="w-5 h-5 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
          >
            <Plus size={11} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {expanded && (
        <div id="sidebar-favorites-list" className="space-y-px">
          {favorites.length === 0 && !adding && (
            <p className="px-2 py-2 text-[11px] text-muted-foreground/60 leading-snug">
              No favorites yet. Star a page to keep it close.
            </p>
          )}

          {favorites.map((fav) => (
            <div
              key={fav.id}
              className="group/fav flex items-center gap-1.5 h-8 pl-2 pr-1 rounded-md text-[12px] text-foreground/70 hover:bg-foreground/[0.025] hover:text-foreground transition-colors duration-150"
            >
              <Star size={12} strokeWidth={1.75} className="flex-shrink-0 text-muted-foreground/55" />
              <Link
                href={resolveHref(fav.href)}
                onClick={onNavigate}
                className="flex-1 min-w-0 truncate"
                title={fav.label}
              >
                {fav.label}
              </Link>
              <button
                type="button"
                onClick={() => removeFavorite(fav.id)}
                aria-label={`Remove ${fav.label}`}
                className="flex-shrink-0 w-5 h-5 inline-flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors opacity-0 group-hover/fav:opacity-100 focus-visible:opacity-100"
              >
                <X size={10} strokeWidth={1.75} />
              </button>
              <GripVertical
                size={11}
                strokeWidth={1.75}
                className="flex-shrink-0 text-muted-foreground/25 opacity-0 group-hover/fav:opacity-100 cursor-grab"
                aria-hidden
              />
            </div>
          ))}

          {adding && (
            <div className="mt-1 rounded-md border border-border/70 bg-card p-2 space-y-1.5">
              <input
                type="text"
                autoFocus
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Label"
                className="w-full h-7 px-2 text-[12px] bg-transparent border-b border-border/60 outline-none focus:border-foreground/50 placeholder:text-muted-foreground/50"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setDraftLabel('');
                    setDraftHref('');
                  }
                }}
              />
              <input
                type="text"
                value={draftHref}
                onChange={(e) => setDraftHref(e.target.value)}
                placeholder="/contacts/123 or full URL"
                className="w-full h-7 px-2 text-[12px] bg-transparent border-b border-border/60 outline-none focus:border-foreground/50 placeholder:text-muted-foreground/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitFavorite();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setDraftLabel('');
                    setDraftHref('');
                  }
                }}
              />
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraftLabel('');
                    setDraftHref('');
                  }}
                  className="px-2 h-6 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitFavorite}
                  disabled={!draftLabel.trim() || !draftHref.trim()}
                  className="px-2.5 h-6 text-[11px] font-medium rounded-md bg-foreground text-background disabled:opacity-40 hover:bg-foreground/90 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
