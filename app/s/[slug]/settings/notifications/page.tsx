'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  H2,
  SECTION_LABEL,
  BODY,
  BODY_MUTED,
  CAPTION,
  PRIMARY_PILL,
  SECTION_RHYTHM,
  READING_MAX,
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

export default function NotificationsSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

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
    return (
      <div className="space-y-6 max-w-3xl animate-pulse">
        <div className="h-8 bg-foreground/[0.04] rounded-md w-40" />
        <div className="h-64 bg-foreground/[0.04] rounded-md" />
      </div>
    );
  }

  return (
    <div className={`${SECTION_RHYTHM} ${READING_MAX}`}>
      <h2 className={H2}>Notifications</h2>

      <form onSubmit={handleSave} className="space-y-10">
        {/* Channels */}
        <section className="space-y-4">
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
                    Add your phone number in General settings to enable SMS.
                  </span>
                )
              }
              checked={smsNotifications}
              onChange={setSmsNotifications}
              disabled={!phoneNumber}
            />
          </div>
        </section>

        {/* Events */}
        {anyChannelOn ? (
          <section className="space-y-4 pt-8 border-t border-border/60">
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
          </section>
        ) : (
          <p className={`${BODY_MUTED} italic pt-2`}>
            Enable at least one delivery channel to configure event notifications.
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
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
    </div>
  );
}
