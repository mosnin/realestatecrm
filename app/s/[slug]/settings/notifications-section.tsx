'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PushToggle } from '@/components/push/push-toggle';
import {
  BODY,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';

interface NotificationsSectionProps {
  slug: string;
}

type DigestCadence = 'off' | 'daily' | 'weekly';

const CADENCE_OPTIONS: { value: DigestCadence; label: string }[] = [
  { value: 'off', label: 'As they happen' },
  { value: 'daily', label: 'Daily summary' },
  { value: 'weekly', label: 'Weekly summary' },
];

/**
 * One toggle for the master email switch, plus an opt-in digest cadence. The
 * default cadence is "As they happen" (off) — the existing per-event behavior,
 * unchanged. Choosing Daily/Weekly rolls notable events into one summary email
 * and is saved as a PER-MEMBER override (so each member of a brokerage space
 * tunes their own), resolved over the space default server-side.
 */
export function NotificationsSection({ slug }: NotificationsSectionProps) {
  const [notifications, setNotifications] = useState(true);
  const [cadence, setCadence] = useState<DigestCadence>('off');
  const [userEmail, setUserEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/notification-preferences?slug=${encodeURIComponent(slug)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([spaceData, prefData]) => {
        if (spaceData) {
          const s = spaceData.settings ?? spaceData;
          setNotifications(s.notifications ?? true);
          setUserEmail(spaceData.ownerEmail ?? spaceData.email ?? '');
        }
        // Effective cadence = member override ?? space default, resolved server-side.
        if (prefData?.effective?.digestCadence) {
          setCadence(prefData.effective.digestCadence as DigestCadence);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // Master email toggle lives on the space (SpaceSetting.notifications);
      // the digest cadence is the caller's per-member override.
      const [spaceRes, prefRes] = await Promise.all([
        fetch('/api/spaces', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, notifications }),
        }),
        fetch('/api/notification-preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, digestCadence: cadence }),
        }),
      ]);
      if (!spaceRes.ok) {
        const d = await spaceRes.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save.');
      }
      if (!prefRes.ok) {
        const d = await prefRes.json().catch(() => ({}));
        throw new Error(d.error || 'Could not save your digest preference.');
      }
      setSaved(true);
      toast.success('Notifications saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That tripped me up. Try again.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-20 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Email me when something happens</p>
          <p className={`${CAPTION} mt-0.5`}>
            New leads, tour bookings, follow-ups due. Sent to{' '}
            <span className="text-foreground">{userEmail || 'your account email'}</span>.
          </p>
        </div>
        <Switch checked={notifications} onCheckedChange={setNotifications} />
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-4 py-3 border-t border-border/60 transition-opacity',
          !notifications && 'opacity-50',
        )}
      >
        <div className="min-w-0">
          <p className={`${BODY} font-medium`}>Email frequency</p>
          <p className={`${CAPTION} mt-0.5`}>
            {cadence === 'off'
              ? 'One email per event, as it happens.'
              : `One ${cadence} summary email instead of per-event emails.`}
          </p>
        </div>
        <select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as DigestCadence)}
          disabled={!notifications}
          className={cn(
            'h-9 px-3 rounded-md border border-border/70 bg-background text-sm',
            'focus:outline-none focus:ring-2 focus:ring-foreground/30',
            'disabled:cursor-not-allowed',
          )}
        >
          {CADENCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <PushToggle slug={slug} />

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className={cn(PRIMARY_PILL, 'disabled:opacity-60 disabled:cursor-not-allowed')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving' : saved ? 'Saved' : 'Save changes'}
        </button>
        {saved && <p className={BODY_MUTED}>Changes saved.</p>}
      </div>
    </form>
  );
}
