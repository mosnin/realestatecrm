'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Space } from '@/lib/types';
import {
  SECTION_LABEL,
  BODY_MUTED,
  CAPTION,
  FIELD_RHYTHM,
  PRIMARY_PILL,
} from '@/lib/typography';

interface GeneralSettingsFormProps {
  space: Space;
  settings: {
    phoneNumber?: string | null;
    myConnections?: string | null;
  } | null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className={SECTION_LABEL}>{children}</p>;
}

export function DangerZone({ space }: { space: Space }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        `Are you sure you want to delete "${space.name}"? This will permanently delete all clients, deals, and data. This cannot be undone.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete workspace. Please try again.');
        return;
      }
      router.push('/');
    } catch {
      alert('Network error. Please check your connection and try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className={BODY_MUTED}>
        Deleting your space is permanent and will remove all clients, deals, and data. This cannot be undone.
      </p>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className={cn(
          'inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-medium',
          'bg-destructive text-white hover:bg-destructive/90 active:scale-[0.98] transition-all duration-150',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
      >
        {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {deleting ? 'Deleting' : 'Delete space'}
      </button>
    </div>
  );
}

export function GeneralSettingsForm({ space, settings }: GeneralSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [newSlug, setNewSlug] = useState(space.slug);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(settings?.phoneNumber ?? '');
  const [myConnections, setMyConnections] = useState(settings?.myConnections ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const checkSlug = useCallback(
    async (value: string) => {
      if (value === space.slug) {
        setSlugAvailable(null);
        return;
      }
      if (value.length < 3) {
        setSlugAvailable(null);
        return;
      }
      setCheckingSlug(true);
      try {
        const res = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check_slug', slug: value }),
        });
        const data = await res.json();
        setSlugAvailable(data.available);
      } finally {
        setCheckingSlug(false);
      }
    },
    [space.slug],
  );

  useEffect(() => {
    const timer = setTimeout(() => checkSlug(newSlug), 400);
    return () => clearTimeout(timer);
  }, [newSlug, checkSlug]);

  const slugChanged = newSlug !== space.slug;
  const slugValid = !slugChanged || (slugChanged && newSlug.length >= 3 && slugAvailable === true);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: space.slug,
          newSlug: slugChanged ? newSlug : undefined,
          name,
          phoneNumber,
          myConnections,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setSlugAvailable(false);
          setSaveError('That slug was just taken. Please pick a different one.');
          return;
        }
        setSaveError(data.error || 'Failed to save settings. Please try again.');
        return;
      }
      const updated = await res.json().catch(() => ({}));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      if (slugChanged && updated.slug) {
        router.replace(`/s/${updated.slug}/settings`);
      } else {
        router.refresh();
      }
    } catch {
      setSaveError('Network error. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-10">
      {/* Workspace fields — section label provided by parent page */}
      <div className={FIELD_RHYTHM}>
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-[12.5px] font-medium text-foreground">
            Workspace name
          </Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug" className="text-[12.5px] font-medium text-foreground">
            Slug
          </Label>
          <div className="relative">
            <Input
              id="slug"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="pr-16"
            />
            {slugChanged && newSlug.length >= 3 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingSlug ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <CheckCircle2 size={14} className="text-foreground" />
                ) : slugAvailable === false ? (
                  <span className="text-xs font-medium text-destructive">taken</span>
                ) : null}
              </div>
            )}
          </div>
          <p className={CAPTION}>
            Your intake link: chippi.com/apply/{newSlug}
          </p>
        </div>
      </div>

      {/* Contact fields — separator + label rendered as a sub-section header */}
      <div className="pt-8 border-t border-border/60 space-y-5">
        <p className={SECTION_LABEL}>Contact</p>
        <div className={FIELD_RHYTHM}>
          <div className="space-y-1.5">
            <Label htmlFor="number" className="text-[12.5px] font-medium text-foreground">
              Phone number
            </Label>
            <Input
              id="number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="(555) 123-4567"
            />
            <p className={CAPTION}>
              Used for SMS notifications and shown on tour booking pages.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="connections" className="text-[12.5px] font-medium text-foreground">
              My connections
            </Label>
            <Input
              id="connections"
              value={myConnections}
              onChange={(e) => setMyConnections(e.target.value)}
              placeholder="Brokerages, lenders, partners"
            />
            <p className={CAPTION}>
              Visible to AI context for follow-up suggestions.
            </p>
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || !slugValid}
            className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
          </button>
          {saved && <p className={BODY_MUTED}>Changes saved.</p>}
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>
    </form>
  );
}
