'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { buildIntakeUrl } from '@/lib/intake';
import { CheckCircle2, Loader2, User, Link2, Bell, AlertCircle, Image, Palette } from 'lucide-react';
import { toast } from 'sonner';

interface ConfigureAccountFormProps {
  initialData: {
    name: string;
    email: string;
    phone: string;
    businessName: string;
    slug: string;
    intakePageTitle: string;
    intakePageIntro: string;
    notifications: boolean;
    logoUrl: string;
    realtorPhotoUrl: string;
  };
  slug: string;
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof User;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-border mb-5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={15} className="text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

export function ConfigureAccountForm({ initialData, slug }: ConfigureAccountFormProps) {
  const [name, setName] = useState(initialData.name);
  const [phone, setPhone] = useState(initialData.phone);
  const [businessName, setBusinessName] = useState(initialData.businessName);
  const [intakePageTitle, setIntakePageTitle] = useState(
    initialData.intakePageTitle || 'Rental Application'
  );
  const [intakePageIntro, setIntakePageIntro] = useState(
    initialData.intakePageIntro ||
      'Share a few details so I can review your rental fit faster.'
  );
  const [notifications, setNotifications] = useState(initialData.notifications);
  const [logoUrl, setLogoUrl] = useState(initialData.logoUrl || '');
  const [realtorPhotoUrl, setRealtorPhotoUrl] = useState(initialData.realtorPhotoUrl || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Slug is always locked here — workspace already exists
  const previewUrl = buildIntakeUrl(slug);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setSaved(false);

    try {
      // Save profile
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_profile', name, phone, businessName }),
      });
      if (!profileRes.ok) {
        const d = await profileRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile.');
      }

      // Update space settings (create_space is idempotent when space exists)
      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          intakePageTitle,
          intakePageIntro,
          businessName,
          logoUrl: logoUrl.trim() || null,
          realtorPhotoUrl: realtorPhotoUrl.trim() || null,
        }),
      });
      if (!spaceRes.ok) {
        const d = await spaceRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to update workspace settings.');
      }

      // Save notifications
      const notifRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_notifications',
          emailNotifications: notifications,
          defaultSubmissionStatus: 'New',
        }),
      });
      if (!notifRes.ok) {
        const d = await notifRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save notification settings.');
      }

      // Ensure onboard=true (idempotent — safe to call even if already true)
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });

      setSaved(true);
      toast.success('Account configured successfully.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Configure your account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update your profile, intake link, and notification preferences.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Profile ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card px-5 py-5">
          <SectionHeader
            icon={User}
            title="Your profile"
            description="This info appears on your intake page and in lead notifications."
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Preston"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="businessName">Business or brand name</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Preston Leasing"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={initialData.email}
                disabled
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">Managed via your Clerk account</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                required
              />
            </div>
          </div>
        </section>

        {/* ── Intake link ──────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card px-5 py-5">
          <SectionHeader
            icon={Link2}
            title="Intake link"
            description="The link renters fill out. Share it anywhere — leads flow straight into your CRM."
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Your intake link</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <code className="text-xs break-all">{previewUrl}</code>
              </div>
              <p className="text-xs text-muted-foreground">
                Your link slug is fixed after creation.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakePageTitle">Page title</Label>
              <Input
                id="intakePageTitle"
                value={intakePageTitle}
                onChange={(e) => setIntakePageTitle(e.target.value)}
                placeholder="Rental Application"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="intakePageIntro">Intro line</Label>
              <Input
                id="intakePageIntro"
                value={intakePageIntro}
                onChange={(e) => setIntakePageIntro(e.target.value)}
                placeholder="Share a few details so I can review your rental fit faster."
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Preview
              </p>
              <p className="font-semibold text-sm">
                {intakePageTitle || 'Rental Application'}
              </p>
              <p className="text-xs text-muted-foreground">
                {intakePageIntro || 'Your intro line here.'}
              </p>
            </div>
          </div>
        </section>

        {/* ── Branding ─────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card px-5 py-5">
          <SectionHeader
            icon={Image}
            title="Branding"
            description="Customize how your intake and tour booking pages look to prospects."
          />
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Your company logo — displayed on intake and booking pages. Use a direct image URL.
              </p>
              {logoUrl && (
                <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Preview</p>
                  <img src={logoUrl} alt="Logo preview" className="h-10 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="realtorPhotoUrl">Profile photo URL</Label>
              <Input
                id="realtorPhotoUrl"
                value={realtorPhotoUrl}
                onChange={(e) => setRealtorPhotoUrl(e.target.value)}
                placeholder="https://example.com/headshot.jpg"
              />
              <p className="text-xs text-muted-foreground">
                Your professional headshot — shown on public pages alongside your name and phone number.
              </p>
              {realtorPhotoUrl && (
                <div className="mt-2 flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                  <img src={realtorPhotoUrl} alt="Photo preview" className="w-12 h-12 rounded-full object-cover ring-2 ring-border" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div>
                    <p className="text-sm font-medium">{name || 'Your Name'}</p>
                    <p className="text-xs text-muted-foreground">{phone || 'Your phone'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Notifications ────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-card px-5 py-5">
          <SectionHeader
            icon={Bell}
            title="Notifications"
            description="Choose how you want to be notified when a new lead comes in."
          />
          <div>
            <div className="flex items-center justify-between py-3 border-b border-border">
              <div>
                <p className="text-sm font-medium">Email notifications</p>
                <p className="text-xs text-muted-foreground">
                  Get an email for each new submission
                </p>
              </div>
              <Switch checked={notifications} onCheckedChange={setNotifications} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Dashboard badge</p>
                <p className="text-xs text-muted-foreground">Unread count in the sidebar</p>
              </div>
              <Switch checked disabled />
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <AlertCircle size={15} className="text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={saving}>
          {saving ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Saving...
            </>
          ) : saved ? (
            <>
              <CheckCircle2 size={16} className="mr-2 text-green-500" />
              Saved
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </form>
    </div>
  );
}
