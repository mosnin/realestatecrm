'use client';

/**
 * Editor for the realtor's public "link in bio" page (/p/[slug]).
 *
 * Reads and writes the ProfilePage row through /api/profile-page. The
 * realtor's photo, name, and bio aren't here — those come from
 * Settings → Profile so there's one place to edit identity. This screen
 * owns only the page-specific bits: live toggle, headline, which
 * sections show, and the custom links.
 */

import { useEffect, useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUpRight,
  Copy,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BODY_MUTED, CAPTION, PRIMARY_PILL } from '@/lib/typography';

interface CustomLink {
  id: string;
  label: string;
  url: string;
}

const MAX_LINKS = 20;

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `link-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProfileEditor({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [enabled, setEnabled] = useState(true);
  const [headline, setHeadline] = useState('');
  const [showIntake, setShowIntake] = useState(true);
  const [showTours, setShowTours] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [copied, setCopied] = useState(false);

  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Initial config load.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/profile-page');
        if (!res.ok) throw new Error('load failed');
        const data = await res.json();
        if (!active) return;
        applyConfig(data);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function applyConfig(data: Record<string, unknown>) {
    setEnabled(data.enabled !== false);
    setHeadline(typeof data.headline === 'string' ? data.headline : '');
    setShowIntake(data.showIntake !== false);
    setShowTours(data.showTours !== false);
    setShowProperties(data.showProperties !== false);
    setCustomLinks(
      Array.isArray(data.customLinks)
        ? (data.customLinks as CustomLink[]).map((l) => ({
            id: typeof l.id === 'string' && l.id ? l.id : newId(),
            label: typeof l.label === 'string' ? l.label : '',
            url: typeof l.url === 'string' ? l.url : '',
          }))
        : [],
    );
  }

  function updateLink(id: string, patch: Partial<CustomLink>) {
    setCustomLinks((links) =>
      links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }

  function removeLink(id: string) {
    setCustomLinks((links) => links.filter((l) => l.id !== id));
  }

  function addLink() {
    setCustomLinks((links) =>
      links.length >= MAX_LINKS
        ? links
        : [...links, { id: newId(), label: '', url: '' }],
    );
  }

  const publicUrl = origin ? `${origin}/p/${slug}` : `/p/${slug}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the visible URL is still selectable */
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');

    const cleaned = customLinks
      .map((l) => ({ ...l, label: l.label.trim(), url: l.url.trim() }))
      .filter((l) => l.label || l.url);
    const hasInvalid = cleaned.some(
      (l) => !l.label || !/^https?:\/\//i.test(l.url),
    );
    if (hasInvalid) {
      setSaveError(
        'Each link needs a label and a URL that starts with http:// or https://.',
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/profile-page', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          headline: headline.trim() || null,
          showIntake,
          showTours,
          showProperties,
          customLinks: cleaned,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || "Couldn't save. Try again.");
        return;
      }
      const data = await res.json();
      applyConfig(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setSaveError('Network hiccup. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-5 py-10 text-center">
        <p className="text-sm text-foreground">Couldn&apos;t load your page.</p>
        <p className={cn(CAPTION, 'mt-1')}>Usually temporary — refresh to try again.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-12">
      {/* ── Share ──────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Your link</h2>
          <p className={BODY_MUTED}>
            Put this one link in your Instagram bio, email signature, or
            anywhere a lead might find you.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {publicUrl}
          </code>
          <button
            type="button"
            onClick={copyUrl}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/40"
          >
            {copied ? (
              <>
                <Check size={13} className="text-foreground" />
                Copied
              </>
            ) : (
              <>
                <Copy size={13} />
                Copy
              </>
            )}
          </button>
          <a
            href={`/p/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/40"
          >
            View page
            <ArrowUpRight size={13} />
          </a>
        </div>

        <div className="flex items-start gap-3 pt-1">
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
          <div className="space-y-0.5">
            <Label
              htmlFor="enabled"
              className="cursor-pointer text-[12.5px] font-medium text-foreground"
            >
              Page is live
            </Label>
            <p className={CAPTION}>
              {enabled
                ? 'Anyone with the link can see it.'
                : 'Turned off — the link shows a "not found" page until you publish.'}
            </p>
          </div>
        </div>
      </section>

      {/* ── Headline ───────────────────────────────────────────────────── */}
      <section className="space-y-4 border-t border-border/60 pt-10">
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Headline</h2>
          <p className={BODY_MUTED}>
            One line under your name. Your photo, name, and bio come from{' '}
            <a
              href={`/s/${slug}/settings?tab=profile`}
              className="text-foreground underline underline-offset-2 hover:text-foreground/80"
            >
              Settings → Profile
            </a>
            .
          </p>
        </header>
        <div className="space-y-1.5">
          <Label
            htmlFor="headline"
            className="text-[12.5px] font-medium text-foreground"
          >
            Headline
          </Label>
          <Input
            id="headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Helping families find home in Austin."
            maxLength={200}
          />
          <p className={CAPTION}>Optional. Up to 200 characters.</p>
        </div>
      </section>

      {/* ── Sections ───────────────────────────────────────────────────── */}
      <section
        id="sections"
        className="scroll-mt-24 space-y-4 border-t border-border/60 pt-10"
      >
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Sections</h2>
          <p className={BODY_MUTED}>What shows on the page, top to bottom.</p>
        </header>
        <div className="space-y-4">
          <ToggleRow
            id="showIntake"
            checked={showIntake}
            onChange={setShowIntake}
            label="Application"
            help="The button to start an application — your main way to capture a lead."
          />
          <ToggleRow
            id="showTours"
            checked={showTours}
            onChange={setShowTours}
            label="Book a tour"
            help="A link to your tour-booking page."
          />
          <ToggleRow
            id="showProperties"
            checked={showProperties}
            onChange={setShowProperties}
            label="Featured listings"
            help="Your six most recently updated active listings."
          />
        </div>
      </section>

      {/* ── Custom links ───────────────────────────────────────────────── */}
      <section
        id="links"
        className="scroll-mt-24 space-y-4 border-t border-border/60 pt-10"
      >
        <header className="space-y-1">
          <h2 className="text-base font-semibold">Custom links</h2>
          <p className={BODY_MUTED}>
            Anything else worth a tap — your website, a saved-search page, a
            review profile.
          </p>
        </header>

        {customLinks.length === 0 ? (
          <p className={CAPTION}>No custom links yet.</p>
        ) : (
          <div className="space-y-3">
            {customLinks.map((link) => (
              <div key={link.id} className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <Input
                    value={link.label}
                    onChange={(e) => updateLink(link.id, { label: e.target.value })}
                    placeholder="Link label"
                    maxLength={80}
                    aria-label="Link label"
                  />
                  <Input
                    value={link.url}
                    onChange={(e) => updateLink(link.id, { url: e.target.value })}
                    placeholder="https://"
                    maxLength={500}
                    inputMode="url"
                    aria-label="Link URL"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLink(link.id)}
                  aria-label="Remove link"
                  className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addLink}
          disabled={customLinks.length >= MAX_LINKS}
        >
          <Plus size={14} />
          Add link
        </Button>
        {customLinks.length >= MAX_LINKS && (
          <p className={CAPTION}>You&apos;ve reached the limit of {MAX_LINKS} links.</p>
        )}
      </section>

      {/* ── Save ───────────────────────────────────────────────────────── */}
      <div className="space-y-3 border-t border-border/60 pt-6">
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className={cn(
              PRIMARY_PILL,
              'disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving' : 'Save changes'}
          </button>
          {saved && (
            <span className={cn('inline-flex items-center gap-1.5', BODY_MUTED)}>
              <CheckCircle2 size={14} className="text-foreground" />
              Saved
            </span>
          )}
        </div>
      </div>
    </form>
  );
}

function ToggleRow({
  id,
  checked,
  onChange,
  label,
  help,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <div className="space-y-0.5">
        <Label
          htmlFor={id}
          className="cursor-pointer text-[12.5px] font-medium text-foreground"
        >
          {label}
        </Label>
        <p className={CAPTION}>{help}</p>
      </div>
    </div>
  );
}
