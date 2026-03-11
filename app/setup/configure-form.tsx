'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { BrandLogo } from '@/components/brand-logo';
import { buildIntakeUrl } from '@/lib/intake';
import {
  CheckCircle2,
  Loader2,
  User,
  Link2,
  Bell,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface ConfigureFormProps {
  initialData: {
    userId: string;
    name: string;
    email: string;
    phone: string;
    businessName: string;
    slug: string;
    intakePageTitle: string;
    intakePageIntro: string;
    notifications: boolean;
    spaceExists: boolean;
  };
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

export function ConfigureForm({ initialData }: ConfigureFormProps) {
  const router = useRouter();

  // Profile section
  const [name, setName] = useState(initialData.name);
  const [phone, setPhone] = useState(initialData.phone);
  const [businessName, setBusinessName] = useState(initialData.businessName);

  // Intake link section
  const [slug, setSlug] = useState(initialData.slug);
  const [intakePageTitle, setIntakePageTitle] = useState(
    initialData.intakePageTitle || 'Rental Application'
  );
  const [intakePageIntro, setIntakePageIntro] = useState(
    initialData.intakePageIntro ||
      'Share a few details so I can review your rental fit faster.'
  );
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(
    initialData.spaceExists ? true : null
  );
  const [checkingSlug, setCheckingSlug] = useState(false);

  // Notifications section
  const [notifications, setNotifications] = useState(initialData.notifications);

  // Submit state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const checkSlug = useCallback(
    async (value: string) => {
      if (initialData.spaceExists) return;
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
    [initialData.spaceExists]
  );

  useEffect(() => {
    const timer = setTimeout(() => checkSlug(slug), 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  const previewUrl = buildIntakeUrl(slug || 'your-link');

  const isValid =
    name.trim() &&
    phone.trim() &&
    businessName.trim() &&
    slug.length >= 3 &&
    intakePageTitle.trim() &&
    (initialData.spaceExists || slugAvailable === true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || saving) return;
    setSaving(true);
    setError('');

    try {
      // 1. Save profile
      const profileRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name,
          phone,
          businessName,
        }),
      });
      if (!profileRes.ok) {
        const d = await profileRes.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile.');
      }

      // 2. Create or update space
      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          intakePageTitle,
          intakePageIntro,
          businessName,
        }),
      });
      const spaceData = await spaceRes.json().catch(() => ({}));
      if (!spaceRes.ok) {
        throw new Error(spaceData.error || 'Failed to create workspace.');
      }
      const resolvedSlug: string = spaceData.slug ?? slug;

      // 3. Save notifications
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

      // 4. Mark as complete
      const completeRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      if (!completeRes.ok) {
        const d = await completeRes.json().catch(() => ({}));
        throw new Error(d.error || 'Could not complete account setup. Please try again.');
      }

      // 5. Navigate to workspace
      router.push(`/s/${resolvedSlug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      toast.error(msg);
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <BrandLogo className="h-6" alt="Chippi" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Configure your account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your profile and intake link to start collecting leads.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* ── Profile ─────────────────────────────────────────────── */}
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

          {/* ── Intake link ──────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card px-5 py-5">
            <SectionHeader
              icon={Link2}
              title="Intake link"
              description="The link renters fill out. Share it anywhere — leads flow straight into your CRM."
            />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="slug">Link slug</Label>
                <div className="relative">
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) =>
                      setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    }
                    placeholder="preston-leasing"
                    disabled={initialData.spaceExists}
                    className="pr-8"
                    required
                  />
                  {!initialData.spaceExists && slug.length >= 3 && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {checkingSlug ? (
                        <Loader2 size={14} className="animate-spin text-muted-foreground" />
                      ) : slugAvailable === true ? (
                        <CheckCircle2 size={14} className="text-green-500" />
                      ) : slugAvailable === false ? (
                        <span className="text-red-500 text-xs font-medium">taken</span>
                      ) : null}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground break-all">{previewUrl}</p>
                {initialData.spaceExists && (
                  <p className="text-xs text-muted-foreground">
                    Your link slug is fixed after creation.
                  </p>
                )}
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

              {/* Live preview */}
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

          {/* ── Notifications ────────────────────────────────────────── */}
          <section className="rounded-xl border border-border bg-card px-5 py-5">
            <SectionHeader
              icon={Bell}
              title="Notifications"
              description="Choose how you want to be notified when a new lead comes in."
            />

            <div className="space-y-1">
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

          {/* ── Error ─────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <AlertCircle size={15} className="text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* ── Submit ────────────────────────────────────────────────── */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!isValid || saving}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Setting up your account...
              </>
            ) : (
              'Save & go to my CRM'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
