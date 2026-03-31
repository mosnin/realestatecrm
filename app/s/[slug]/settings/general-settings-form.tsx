'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { Space } from '@/lib/types';

interface GeneralSettingsFormProps {
  space: Space;
  settings: {
    phoneNumber?: string | null;
    myConnections?: string | null;
  } | null;
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
  const [deleting, setDeleting] = useState(false);

  const checkSlug = useCallback(async (value: string) => {
    if (value === space.slug) { setSlugAvailable(null); return; }
    if (value.length < 3) { setSlugAvailable(null); return; }
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
  }, [space.slug]);

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

  async function handleDelete() {
    if (!confirm(`Are you sure you want to delete "${space.name}"? This will permanently delete all clients, deals, and data. This cannot be undone.`)) return;
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
    <form onSubmit={handleSave} className="space-y-5">
      {/* Workspace */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <p className="font-semibold text-sm">Workspace</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your workspace name and slug.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Workspace name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slug">Slug</Label>
            <div className="relative">
              <Input
                id="slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                className="pr-8"
              />
              {slugChanged && newSlug.length >= 3 && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingSlug ? (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  ) : slugAvailable === true ? (
                    <CheckCircle2 size={14} className="text-green-500 dark:text-green-400" />
                  ) : slugAvailable === false ? (
                    <span className="text-red-500 dark:text-red-400 text-xs font-medium">taken</span>
                  ) : null}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Your intake link: chippi.com/apply/{newSlug}</p>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <p className="font-semibold text-sm">Contact &amp; connections</p>
          <p className="text-xs text-muted-foreground mt-0.5">Your phone number and partner connections visible to AI context.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="number">Phone number</Label>
            <Input id="number" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="(555) 123-4567" />
            <p className="text-xs text-muted-foreground">Used for SMS notifications and displayed on tour booking pages</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="connections">My connections</Label>
            <Input id="connections" value={myConnections} onChange={(e) => setMyConnections(e.target.value)} placeholder="Brokerages, lenders, partners" />
          </div>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !slugValid}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save settings'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 bg-card overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-destructive/20 bg-destructive/5">
          <p className="font-semibold text-sm text-destructive">Danger zone</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground mb-4">Deleting your space is permanent and will remove all clients, deals, and data. This cannot be undone.</p>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'Delete space'}
          </Button>
        </div>
      </div>
    </form>
  );
}
