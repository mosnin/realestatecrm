'use client';

import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  SECTION_LABEL,
  BODY,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
} from '@/lib/typography';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className={SECTION_LABEL}>{children}</p>;
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border/60 last:border-b-0">
      <div className="min-w-0">
        <p className={`${BODY} font-medium`}>{label}</p>
        {description && <p className={`${CAPTION} mt-0.5`}>{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

interface NotificationsSectionProps {
  slug: string;
}

/**
 * Notifications form, mounted as a section inside the General settings page.
 * Submits to the same /api/spaces PATCH endpoint the dedicated page used.
 */
export function NotificationsSection({ slug }: NotificationsSectionProps) {
  const [notifications, setNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [notifyNewLeads, setNotifyNewLeads] = useState(true);
  const [notifyTourBookings, setNotifyTourBookings] = useState(true);
  const [notifyNewDeals, setNotifyNewDeals] = useState(true);
  const [notifyFollowUps, setNotifyFollowUps] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        const s = data.settings ?? data;
        setNotifications(s.notifications ?? true);
        setSmsNotifications(s.smsNotifications ?? false);
        setNotifyNewLeads(s.notifyNewLeads ?? true);
        setNotifyTourBookings(s.notifyTourBookings ?? true);
        setNotifyNewDeals(s.notifyNewDeals ?? true);
        setNotifyFollowUps(s.notifyFollowUps ?? true);
        setPhoneNumber(s.phoneNumber ?? '');
        setUserEmail(data.ownerEmail ?? data.email ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  const anyChannelOn = notifications || smsNotifications;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          notifications,
          smsNotifications,
          notifyNewLeads,
          notifyTourBookings,
          notifyNewDeals,
          notifyFollowUps,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save notification settings.');
      }
      setSaved(true);
      toast.success('Notification settings saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-40 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  return (
    <form onSubmit={handleSave} className="space-y-8">
      <div className="space-y-4">
        <SectionLabel>Delivery</SectionLabel>
        <div>
          <ToggleRow
            label="Email"
            description={
              userEmail ? (
                <>
                  Sent to <span className="text-foreground">{userEmail}</span>
                </>
              ) : null
            }
            checked={notifications}
            onChange={setNotifications}
          />
          <ToggleRow
            label="SMS"
            description={
              phoneNumber ? (
                <>
                  Sent to <span className="text-foreground">{phoneNumber}</span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Add your phone number above to enable SMS.
                </span>
              )
            }
            checked={smsNotifications}
            onChange={setSmsNotifications}
            disabled={!phoneNumber}
          />
        </div>
      </div>

      {anyChannelOn ? (
        <div className="space-y-4">
          <SectionLabel>Events</SectionLabel>
          <div>
            <ToggleRow
              label="New leads"
              description="When a new lead application is submitted"
              checked={notifyNewLeads}
              onChange={setNotifyNewLeads}
            />
            <ToggleRow
              label="Tour bookings"
              description="When a guest books a property tour"
              checked={notifyTourBookings}
              onChange={setNotifyTourBookings}
            />
            <ToggleRow
              label="New deals"
              description="When a new deal is created in your pipeline"
              checked={notifyNewDeals}
              onChange={setNotifyNewDeals}
            />
            <ToggleRow
              label="Follow-up reminders"
              description="Daily digest of contacts due for follow-up"
              checked={notifyFollowUps}
              onChange={setNotifyFollowUps}
            />
          </div>
        </div>
      ) : (
        <p className={`${BODY_MUTED} italic`}>
          Enable at least one delivery channel to configure event notifications.
        </p>
      )}

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
