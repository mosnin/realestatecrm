'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/brand-logo';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, AlertCircle, Users, UserCircle, ArrowLeft, Building2, LogOut, Instagram, Linkedin, Facebook, Image, Phone, Globe, MapPin } from 'lucide-react';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';

type SetupRole = 'choose' | 'realtor' | 'broker' | 'broker_only';
type SetupStep = 'choose' | 'create' | 'personalize';

export function CreateWorkspaceForm({ defaultName, userEmail }: { defaultName: string; userEmail: string }) {
  const { signOut } = useClerk();
  const router = useRouter();
  const [role, setRole] = useState<SetupRole>('choose');
  const [step, setStep] = useState<SetupStep>('choose');
  const [businessName, setBusinessName] = useState('');
  const [brokerageName, setBrokerageName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const confettiRef = useRef<ConfettiRef>(null);
  const [error, setError] = useState('');

  // Broker onboarding step: 0 = basic info, 1 = brokerage details, 2 = team info, 3 = business model
  const [brokerStep, setBrokerStep] = useState(0);

  // Broker-specific fields
  const [brokerLogoUrl, setBrokerLogoUrl] = useState('');
  const [brokerWebsiteUrl, setBrokerWebsiteUrl] = useState('');
  const [officeAddress, setOfficeAddress] = useState('');
  const [officePhone, setOfficePhone] = useState('');
  const [agentCount, setAgentCount] = useState('');
  const [brokerageType, setBrokerageType] = useState('');
  const [primaryMarket, setPrimaryMarket] = useState('');
  const [commissionStructure, setCommissionStructure] = useState('');
  const [geographicCoverage, setGeographicCoverage] = useState('');

  // Personalize step state
  const [resolvedSlug, setResolvedSlug] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [facebook, setFacebook] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

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

  const isBrokerRole = role === 'broker_only' || role === 'broker';
  const brokerTotalSteps = 4; // 0=basic, 1=brokerage details, 2=team info, 3=business model

  const canAdvanceBrokerStep = (() => {
    if (!isBrokerRole) return false;
    if (brokerStep === 0) {
      if (role === 'broker_only') return brokerageName.trim().length > 0;
      if (role === 'broker') return brokerageName.trim().length > 0 && businessName.trim().length > 0 && slug.length >= 3 && slugAvailable === true;
    }
    // Steps 1-3 have no required fields (all optional)
    return true;
  })();

  const canSubmit = !saving && (() => {
    if (isBrokerRole) {
      return brokerStep === brokerTotalSteps - 1 && canAdvanceBrokerStep;
    }
    if (!businessName.trim() || slug.length < 3 || slugAvailable !== true) return false;
    return true;
  })();

  function handleBrokerNext(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdvanceBrokerStep) return;
    if (brokerStep < brokerTotalSteps - 1) {
      setBrokerStep(brokerStep + 1);
      return;
    }
    // On the last step, trigger actual submit
    handleSubmit(e);
  }

  const brokerCreateBody = () => ({
    name: brokerageName.trim(),
    logoUrl: brokerLogoUrl.trim() || undefined,
    websiteUrl: brokerWebsiteUrl.trim() || undefined,
    officeAddress: officeAddress.trim() || undefined,
    officePhone: officePhone.trim() || undefined,
    agentCount: agentCount || undefined,
    brokerageType: brokerageType || undefined,
    primaryMarket: primaryMarket || undefined,
    commissionStructure: commissionStructure || undefined,
    geographicCoverage: geographicCoverage.trim() || undefined,
  });

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
          body: JSON.stringify(brokerCreateBody()),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData.error || 'Failed to create brokerage.');

        confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        await new Promise(r => setTimeout(r, 800));
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
          body: JSON.stringify(brokerCreateBody()),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData.error || 'Failed to create brokerage.');
        confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        await new Promise(r => setTimeout(r, 800));
        router.push('/broker');
        return;
      }

      const finalSlug: string = spaceData.slug ?? slug;
      setResolvedSlug(finalSlug);
      confettiRef.current?.fire({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
      await new Promise(r => setTimeout(r, 800));
      setSaving(false);
      setStep('personalize');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      toast.error(msg);
      setSaving(false);
    }
  }

  // Personalize step handlers
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const socialLinks: Record<string, string> = {};
      if (instagram.trim()) socialLinks.instagram = instagram.trim();
      if (linkedin.trim()) socialLinks.linkedin = linkedin.trim();
      if (facebook.trim()) socialLinks.facebook = facebook.trim();

      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: resolvedSlug,
          name: businessName,
          bio: bio.trim() || null,
          socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : {},
          logoUrl: logoUrl.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to save profile.');
      }
      router.push(`/s/${resolvedSlug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      toast.error(msg);
      setSavingProfile(false);
    }
  }

  function handleSkipProfile() {
    router.push(`/s/${resolvedSlug}`);
  }

  // Personalize step
  if (step === 'personalize') {
    return (
      <div className="app-theme min-h-screen bg-background flex items-start justify-center px-4 py-10">
        <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] w-full h-full" />
        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8">
            <BrandLogo className="h-7" alt="Chippi" />
          </div>

          <div className="rounded-xl border border-border bg-card px-6 py-7">
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary mb-3">
                <UserCircle size={10} />
                Personalize
              </div>
              <h1 className="text-xl font-bold">Make it yours</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Add a few optional details to your workspace. You can always change these later.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell renters a bit about yourself (optional)"
                  maxLength={500}
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <Label>Social links</Label>
                <div className="space-y-2">
                  <div className="relative">
                    <Instagram size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="Instagram URL (optional)"
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <Linkedin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="LinkedIn URL (optional)"
                      className="pl-9"
                    />
                  </div>
                  <div className="relative">
                    <Facebook size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={facebook}
                      onChange={(e) => setFacebook(e.target.value)}
                      placeholder="Facebook URL (optional)"
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="logoUrl">Logo</Label>
                <div className="relative">
                  <Image size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="logoUrl"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="Paste your logo URL (optional)"
                    className="pl-9"
                  />
                </div>
                {logoUrl.trim() && (
                  <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl.trim()}
                      alt="Logo preview"
                      className="max-h-16 max-w-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      onLoad={(e) => { (e.target as HTMLImageElement).style.display = 'block'; }}
                    />
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={savingProfile} size="lg">
                {savingProfile ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save & continue'
                )}
              </Button>
            </form>

            <button
              type="button"
              onClick={handleSkipProfile}
              disabled={savingProfile}
              className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors text-center py-1.5"
            >
              Skip &amp; go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
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
            <h1 className="text-2xl font-bold tracking-tight">Finish setting up your account</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Choose your role to get the right setup.
            </p>
            {userEmail && (
              <p className="text-xs text-muted-foreground mt-3">
                Signed in as <span className="font-medium text-foreground">{userEmail}</span>
                {' \u00B7 '}
                <button
                  onClick={() => signOut({ redirectUrl: '/login/realtor' })}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                >
                  <LogOut size={10} />
                  Sign out
                </button>
              </p>
            )}
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
      <Confetti ref={confettiRef} manualstart className="pointer-events-none fixed inset-0 z-[9999] w-full h-full" />
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              if (isBrokerRole && brokerStep > 0) {
                setBrokerStep(brokerStep - 1);
                setError('');
              } else {
                setRole('choose');
                setBrokerStep(0);
                setError('');
              }
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} /> Back
          </button>
          <button
            onClick={() => signOut({ redirectUrl: '/login/realtor' })}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card px-6 py-7">
          <div className="mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary mb-3">
              {role === 'broker_only' ? <Building2 size={10} /> : role === 'broker' ? <Users size={10} /> : <UserCircle size={10} />}
              {role === 'broker_only' ? 'Broker setup' : role === 'broker' ? 'Broker + workspace setup' : 'Realtor setup'}
              {isBrokerRole && (
                <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                  Step {brokerStep + 1} of {brokerTotalSteps}
                </span>
              )}
            </div>
            {isBrokerRole && (
              <div className="flex gap-1 mb-4">
                {Array.from({ length: brokerTotalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= brokerStep ? 'bg-primary' : 'bg-muted'}`}
                  />
                ))}
              </div>
            )}
            <h1 className="text-xl font-bold">
              {!isBrokerRole
                ? 'Create your workspace'
                : brokerStep === 0
                  ? role === 'broker_only' ? 'Create your brokerage' : 'Set up your brokerage'
                  : brokerStep === 1
                    ? 'Brokerage details'
                    : brokerStep === 2
                      ? 'Team info'
                      : 'Business model'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {!isBrokerRole
                ? 'Give your workspace a name and we\'ll generate your intake link.'
                : brokerStep === 0
                  ? role === 'broker_only'
                    ? 'Set up your brokerage to manage your team of realtors.'
                    : 'Create your brokerage and personal workspace in one step.'
                  : brokerStep === 1
                    ? 'Add your brokerage logo, website, and office info.'
                    : brokerStep === 2
                      ? 'Tell us about your team and market focus.'
                      : 'How does your brokerage operate?'}
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
                          <CheckCircle2 size={14} className="text-green-500 dark:text-green-400" />
                        ) : slugAvailable === false ? (
                          <span className="text-red-500 dark:text-red-400 text-xs font-medium">taken</span>
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
