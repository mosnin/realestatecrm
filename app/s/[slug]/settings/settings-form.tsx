'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { Space } from '@/lib/types';

type UserSettings = {
  notifications?: boolean;
  smsNotifications?: boolean;
  notifyNewLeads?: boolean;
  notifyTourBookings?: boolean;
  notifyNewDeals?: boolean;
  notifyFollowUps?: boolean;
  phoneNumber?: string | null;
  myConnections?: string | null;
};

interface SettingsFormProps {
  space: Space;
  settings: UserSettings | null;
  userEmail: string;
}

function SectionBlock({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/20">
        <p className="font-semibold text-sm">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

export function SettingsForm({ space, settings, userEmail }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [newSlug, setNewSlug] = useState(space.slug);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

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

  const [notifications, setNotifications] = useState(
    settings?.notifications ?? true
  );
  const [smsNotifications, setSmsNotifications] = useState(
    settings?.smsNotifications ?? false
  );
  const [notifyNewLeads, setNotifyNewLeads] = useState(settings?.notifyNewLeads ?? true);
  const [notifyTourBookings, setNotifyTourBookings] = useState(settings?.notifyTourBookings ?? true);
  const [notifyNewDeals, setNotifyNewDeals] = useState(settings?.notifyNewDeals ?? true);
  const [notifyFollowUps, setNotifyFollowUps] = useState(settings?.notifyFollowUps ?? true);
  const [phoneNumber, setPhoneNumber] = useState(settings?.phoneNumber ?? '');
  const [myConnections, setMyConnections] = useState(settings?.myConnections ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const anyChannelOn = notifications || smsNotifications;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/spaces`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: space.slug,
          newSlug: slugChanged ? newSlug : undefined,
          name,
          notifications,
          smsNotifications,
          notifyNewLeads,
          notifyTourBookings,
          notifyNewDeals,
          notifyFollowUps,
          phoneNumber,
          myConnections,
        })
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
      // If slug changed, navigate to the new URL
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
    if (
      !confirm(
        `Are you sure you want to delete "${space.name}"? This will permanently delete all clients, deals, and data. This cannot be undone.`
      )
    )
      return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/spaces`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug })
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
      <SectionBlock title="Workspace" description="Your workspace name and slug.">
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slug">Slug</Label>
          <div className="relative">
            <Input
              id="slug"
              value={newSlug}
              onChange={(e) =>
                setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
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
          <p className="text-xs text-muted-foreground">
            Your intake link: chippi.com/apply/{newSlug}
          </p>
        </div>
      </SectionBlock>

      {/* Contact */}
      <SectionBlock title="Contact & connections" description="Your phone number and partner connections visible to AI context.">
        <div className="space-y-1.5">
          <Label htmlFor="number">Phone number</Label>
          <Input
            id="number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="(555) 123-4567"
          />
          <p className="text-xs text-muted-foreground">
            Used for SMS notifications and displayed on tour booking pages
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="connections">My connections</Label>
          <Input
            id="connections"
            value={myConnections}
            onChange={(e) => setMyConnections(e.target.value)}
            placeholder="Brokerages, lenders, partners"
          />
        </div>
      </SectionBlock>

      {/* Notifications */}
      <SectionBlock title="Notifications" description="Choose how and when you get notified about workspace activity.">
        {/* Delivery channels */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Delivery channels</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notifications sent to <span className="font-medium text-foreground">{userEmail}</span>
                </p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">SMS</p>
                {phoneNumber ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Text messages sent to <span className="font-medium text-foreground">{phoneNumber}</span>
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Add your phone number above to enable SMS
                  </p>
                )}
              </div>
              <Switch
                checked={smsNotifications}
                onCheckedChange={setSmsNotifications}
                disabled={!phoneNumber}
              />
            </div>
          </div>
        </div>

        {/* Per-event toggles */}
        {anyChannelOn && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Event types</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New leads</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When a new lead application is submitted
                  </p>
                </div>
                <Switch
                  checked={notifyNewLeads}
                  onCheckedChange={setNotifyNewLeads}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Tour bookings</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When a guest books a property tour
                  </p>
                </div>
                <Switch
                  checked={notifyTourBookings}
                  onCheckedChange={setNotifyTourBookings}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New deals</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When a new deal is created in your pipeline
                  </p>
                </div>
                <Switch
                  checked={notifyNewDeals}
                  onCheckedChange={setNotifyNewDeals}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Follow-up reminders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Daily digest of contacts due for follow-up
                  </p>
                </div>
                <Switch
                  checked={notifyFollowUps}
                  onCheckedChange={setNotifyFollowUps}
                />
              </div>
            </div>
          </div>
        )}

        {!anyChannelOn && (
          <p className="text-xs text-muted-foreground italic pt-2">
            Enable at least one delivery channel to configure event notifications.
          </p>
        )}
      </SectionBlock>

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
          <p className="text-sm text-muted-foreground mb-4">
            Deleting your space is permanent and will remove all clients, deals, and data. This cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete space'}
          </Button>
        </div>
      </div>
    </form>
  );
}
