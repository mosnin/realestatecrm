'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/brand-logo';
import { CheckCircle2, Loader2, AlertCircle, Users, UserCircle, ArrowLeft, Building2 } from 'lucide-react';
import { toast } from 'sonner';

type SetupRole = 'choose' | 'realtor' | 'broker' | 'broker_only';

export function CreateWorkspaceForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [role, setRole] = useState<SetupRole>('choose');
  const [businessName, setBusinessName] = useState('');
  const [brokerageName, setBrokerageName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsWorkspace = role === 'realtor' || role === 'broker';

  // Auto-derive slug from business name
  useEffect(() => {
    if (!businessName.trim()) return;
    const derived = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    setSlug(derived);
  }, [businessName]);

  const checkSlug = useCallback(async (value: string) => {
    if (value.length < 3) { setSlugAvailable(null); return; }
    setChecking(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_slug', slug: value }),
      });
      const data = await res.json();
      setSlugAvailable(data.available);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!needsWorkspace) return;
    const timer = setTimeout(() => checkSlug(slug), 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug, needsWorkspace]);

  const canSubmit = !saving && (() => {
    if (role === 'broker_only') return brokerageName.trim().length > 0;
    if (!businessName.trim() || slug.length < 3 || slugAvailable !== true) return false;
    if (role === 'broker') return brokerageName.trim().length > 0;
    return true;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');

    try {
      if (role === 'broker_only') {
        // Broker-only: skip workspace entirely
        // Save profile
        const profileRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_profile',
            name: defaultName,
            phone: '',
            businessName: brokerageName.trim(),
          }),
        });
        if (!profileRes.ok) {
          const d = await profileRes.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to save profile.');
        }

        // Mark onboarding complete with broker_only account type
        const completeRes = await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete', accountType: 'broker_only' }),
        });
        if (!completeRes.ok) {
          const d = await completeRes.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to complete onboarding.');
        }

        // Create the brokerage
        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: brokerageName.trim() }),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData.error || 'Failed to create brokerage.');

        router.push('/broker');
        return;
      }

      // Realtor or broker-with-workspace flow
      // Save profile
      const profileRes2 = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: defaultName,
          phone: '',
          businessName,
        }),
      });
      if (!profileRes2.ok) {
        const d = await profileRes2.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile.');
      }

      // Create the workspace
      const spaceRes = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_space',
          slug,
          intakePageTitle: 'Rental Application',
          intakePageIntro: 'Share a few details so I can review your rental fit faster.',
          businessName,
        }),
      });
      const spaceData = await spaceRes.json().catch(() => ({}));
      if (!spaceRes.ok) {
        if (spaceRes.status === 409) {
          setSlugAvailable(false);
          setError('That slug was just taken. Please pick a different one.');
          setSaving(false);
          return;
        }
        throw new Error(spaceData.error || 'Failed to create workspace.');
      }

      // Mark onboarding complete
      const accountType = role === 'broker' ? 'both' : 'realtor';
      const completeRes2 = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete', accountType }),
      });
      if (!completeRes2.ok) {
        const d = await completeRes2.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to complete onboarding.');
      }

      // If broker role, also create the brokerage
      if (role === 'broker') {
        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: brokerageName.trim() }),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData.error || 'Failed to create brokerage.');
        router.push('/broker');
        return;
      }

      const resolvedSlug: string = spaceData.slug ?? slug;
      router.push(`/s/${resolvedSlug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      toast.error(msg);
      setSaving(false);
    }
  }

  // Step 1: Role selection
  if (role === 'choose') {
    return (
      <div className="app-theme min-h-screen bg-background flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          <div className="flex justify-center mb-8">
            <BrandLogo className="h-7" alt="Chippi" />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold tracking-tight">How will you use Chippi?</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Choose your role to get the right setup.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <button
              onClick={() => setRole('realtor')}
              className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-[0_4px_24px_-8px_rgba(13,148,136,0.15)] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <UserCircle size={20} className="text-primary" />
              </div>
              <h2 className="text-base font-semibold mb-1">I&apos;m a realtor</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Personal CRM for leads, clients, and deals.
              </p>
            </button>

            <button
              onClick={() => setRole('broker')}
              className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-[0_4px_24px_-8px_rgba(13,148,136,0.15)] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <Users size={20} className="text-primary" />
              </div>
              <h2 className="text-base font-semibold mb-1">Both</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Manage a team and your own workspace.
              </p>
            </button>

            <button
              onClick={() => setRole('broker_only')}
              className="group text-left rounded-xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-[0_4px_24px_-8px_rgba(13,148,136,0.15)] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <Building2 size={20} className="text-primary" />
              </div>
              <h2 className="text-base font-semibold mb-1">Broker only</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Manage your team. No personal workspace.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Workspace / brokerage creation form
  return (
    <div className="app-theme min-h-screen bg-background flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <button
          onClick={() => { setRole('choose'); setError(''); }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={14} /> Back
        </button>

        <div className="rounded-xl border border-border bg-card px-6 py-7">
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-0.5 text-[11px] font-semibold text-primary mb-3">
              {role === 'broker_only' ? <Building2 size={10} /> : role === 'broker' ? <Users size={10} /> : <UserCircle size={10} />}
              {role === 'broker_only' ? 'Broker setup' : role === 'broker' ? 'Broker + workspace setup' : 'Realtor setup'}
            </div>
            <h1 className="text-xl font-bold">
              {role === 'broker_only'
                ? 'Create your brokerage'
                : role === 'broker'
                  ? 'Set up your brokerage'
                  : 'Create your workspace'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {role === 'broker_only'
                ? 'Set up your brokerage to manage your team of realtors.'
                : role === 'broker'
                  ? 'Create your brokerage and personal workspace in one step.'
                  : 'Give your workspace a name and we\'ll generate your intake link.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(role === 'broker' || role === 'broker_only') && (
              <div className="space-y-1.5">
                <Label htmlFor="brokerageName">Brokerage name</Label>
                <Input
                  id="brokerageName"
                  value={brokerageName}
                  onChange={(e) => setBrokerageName(e.target.value)}
                  placeholder="e.g. Preston Realty Group"
                  required
                  autoFocus
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">
                  The name your realtors will see when they join.
                </p>
              </div>
            )}

            {needsWorkspace && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="businessName">
                    {role === 'broker' ? 'Your personal workspace name' : 'Business or brand name'}
                  </Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Preston Leasing"
                    required
                    autoFocus={role === 'realtor'}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="slug">Intake link slug</Label>
                  <div className="relative">
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) =>
                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                      }
                      placeholder="preston-leasing"
                      className="pr-8"
                      required
                    />
                    {slug.length >= 3 && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {checking ? (
                          <Loader2 size={14} className="animate-spin text-muted-foreground" />
                        ) : slugAvailable === true ? (
                          <CheckCircle2 size={14} className="text-green-500" />
                        ) : slugAvailable === false ? (
                          <span className="text-red-500 text-xs font-medium">taken</span>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {slug.length >= 3 && (
                    <p className="text-xs text-muted-foreground break-all">
                      chippi.com/apply/{slug}
                    </p>
                  )}
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertCircle size={14} className="text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!canSubmit} size="lg">
              {saving ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  {role === 'broker_only' ? 'Creating brokerage...' : role === 'broker' ? 'Setting up...' : 'Creating...'}
                </>
              ) : role === 'broker_only' ? (
                <>
                  <Building2 size={16} className="mr-2" />
                  Create brokerage
                </>
              ) : role === 'broker' ? (
                <>
                  <Users size={16} className="mr-2" />
                  Create brokerage & workspace
                </>
              ) : (
                'Create workspace'
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
