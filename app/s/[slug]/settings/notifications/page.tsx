'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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
      <div className="space-y-4 max-w-3xl animate-pulse">
        <div className="h-8 bg-muted rounded-lg w-40" />
        <div className="h-64 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-1">
        <h2 className="text-base font-medium text-foreground">Notifications</h2>
        <p className="text-[13px] text-muted-foreground">Choose how and when you get notified about workspace activity</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Delivery channels */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/20">
            <p className="font-semibold text-sm">Delivery channels</p>
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email</p>
                {userEmail && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Notifications sent to <span className="font-medium text-foreground">{userEmail}</span>
                  </p>
                )}
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
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
                    Add your phone number in General settings to enable SMS
                  </p>
                )}
              </div>
              <Switch checked={smsNotifications} onCheckedChange={setSmsNotifications} disabled={!phoneNumber} />
            </div>
          </div>
        </div>

        {/* Event toggles */}
        {anyChannelOn && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/20">
              <p className="font-semibold text-sm">Event types</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New leads</p>
                  <p className="text-xs text-muted-foreground mt-0.5">When a new lead application is submitted</p>
                </div>
                <Switch checked={notifyNewLeads} onCheckedChange={setNotifyNewLeads} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Tour bookings</p>
                  <p className="text-xs text-muted-foreground mt-0.5">When a guest books a property tour</p>
                </div>
                <Switch checked={notifyTourBookings} onCheckedChange={setNotifyTourBookings} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New deals</p>
                  <p className="text-xs text-muted-foreground mt-0.5">When a new deal is created in your pipeline</p>
                </div>
                <Switch checked={notifyNewDeals} onCheckedChange={setNotifyNewDeals} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Follow-up reminders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Daily digest of contacts due for follow-up</p>
                </div>
                <Switch checked={notifyFollowUps} onCheckedChange={setNotifyFollowUps} />
              </div>
            </div>
          </div>
        )}

        {!anyChannelOn && (
          <p className="text-xs text-muted-foreground italic">Enable at least one delivery channel to configure event notifications.</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Saving...</>
            ) : saved ? 'Saved!' : 'Save notifications'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
      </form>
    </div>
  );
}
