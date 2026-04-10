'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/brand-logo';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2, AlertCircle, Users, UserCircle, ArrowLeft, Building2, LogOut, Instagram, Linkedin, Facebook, Image, Phone, Globe, MapPin, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';

type SetupRole = 'choose' | 'realtor' | 'broker' | 'broker_only';
type SetupStep = 'choose' | 'create' | 'personalize';

export function CreateWorkspaceForm({ defaultName, userEmail, userImageUrl }: { defaultName: string; userEmail: string; userImageUrl?: string }) {
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

  // Realtor additional fields
  const [realtorPhone, setRealtorPhone] = useState('');
  const [realtorBio, setRealtorBio] = useState('');
  const [realtorWebsite, setRealtorWebsite] = useState('');

  // Realtor multi-step: 0 = workspace info, 1 = contact details, 2 = preferences
  const [realtorStep, setRealtorStep] = useState(0);
  const realtorTotalSteps = 3;

  // Shared preferences (both roles)
  const [timezone, setTimezone] = useState('');
  const [hearAbout, setHearAbout] = useState('');
  const [painPoint, setPainPoint] = useState('');

  // Personalize step state
  const [resolvedSlug, setResolvedSlug] = useState('');
  const [bio, setBio] = useState('');
  const [instagram, setInstagram] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [facebook, setFacebook] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [brokerLogoUploading, setBrokerLogoUploading] = useState(false);
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
  const brokerTotalSteps = 5; // 0=basic, 1=brokerage details, 2=team info, 3=business model, 4=preferences

  const canAdvanceBrokerStep = (() => {
    if (!isBrokerRole) return false;
    if (brokerStep === 0) {
      if (role === 'broker_only') return brokerageName.trim().length > 0;
      if (role === 'broker') return brokerageName.trim().length > 0 && businessName.trim().length > 0 && slug.length >= 3 && slugAvailable === true;
    }
    // Steps 1-3 have no required fields (all optional)
    return true;
  })();

  const canAdvanceRealtorStep = (() => {
    if (role !== 'realtor') return false;
    if (realtorStep === 0) {
      return businessName.trim().length > 0 && slug.length >= 3 && slugAvailable === true;
    }
    // Steps 1-2 have no required fields (all optional)
    return true;
  })();

  const canSubmit = !saving && (() => {
    if (isBrokerRole) {
      return brokerStep === brokerTotalSteps - 1 && canAdvanceBrokerStep;
    }
    if (role === 'realtor') {
      return realtorStep === realtorTotalSteps - 1 && canAdvanceRealtorStep;
    }
    if (!businessName.trim() || slug.length < 3 || slugAvailable !== true) return false;
    return true;
  })();

  function handleBrokerNext(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdvanceBrokerStep) return;
    if (brokerStep < brokerTotalSteps - 1) {
      const newStep = brokerStep + 1;
      setBrokerStep(newStep);
      // Persist step progress to the server (non-blocking)
      fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_step', step: newStep }),
      }).catch(() => {}); // non-blocking
      return;
    }
    // On the last step, trigger actual submit
    handleSubmit(e);
  }

  function handleRealtorNext(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdvanceRealtorStep) return;
    if (realtorStep < realtorTotalSteps - 1) {
      const newStep = realtorStep + 1;
      setRealtorStep(newStep);
      // Persist step progress to the server (non-blocking)
      fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_step', step: newStep }),
      }).catch(() => {}); // non-blocking
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
            timezone: timezone || undefined,
            hearAbout: hearAbout || undefined,
            painPoint: painPoint || undefined,
          }),
        });
        if (!profileRes.ok) {
          const d = await profileRes.json().catch(() => ({}));
          throw new Error(d.error || 'Failed to save profile.');
        }

        // Create the brokerage BEFORE marking onboarding complete —
        // if brokerage creation fails, the user can retry without being
        // stuck in a "completed but no brokerage" state.
        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brokerCreateBody()),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData.error || 'Failed to create brokerage.');

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
          phone: role === 'realtor' ? realtorPhone.trim() : '',
          businessName,
          bio: role === 'realtor' ? realtorBio.trim() || undefined : undefined,
          websiteUrl: role === 'realtor' ? realtorWebsite.trim() || undefined : undefined,
          timezone: timezone || undefined,
          hearAbout: hearAbout || undefined,
          painPoint: painPoint || undefined,
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

      // If broker role, create the brokerage BEFORE marking onboarding complete —
      // if brokerage creation fails the user can retry without being stuck.
      if (role === 'broker') {
        const brokerRes = await fetch('/api/broker/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(brokerCreateBody()),
        });
        const brokerData = await brokerRes.json().catch(() => ({}));
        if (!brokerRes.ok) throw new Error(brokerData.error || 'Failed to create brokerage.');

        // Link the personal workspace to the brokerage
        const newBrokerageId = brokerData.brokerage?.id;
        if (newBrokerageId && spaceData?.slug) {
          await fetch('/api/spaces', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: spaceData.slug, brokerageId: newBrokerageId }),
          }).catch(() => {}); // Non-fatal — space still works without link
        }
      }

      // Mark onboarding complete — after brokerage creation (if applicable)
      // so the user is never marked complete without a brokerage.
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

      if (role === 'broker') {
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
                <Label htmlFor="bio">Bio <span className="text-muted-foreground font-normal">(optional)</span></Label>
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
                <Label>Social links <span className="text-muted-foreground font-normal">(optional)</span></Label>
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
                <Label>Logo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div
                  className="relative flex items-center gap-3 rounded-lg border-2 border-dashed border-border p-3 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('onboard-logo-upload')?.click()}
                >
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo preview" className="h-10 max-w-[100px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                      <Image size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{logoUrl ? 'Change logo' : 'Upload logo'}</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, WebP. Max 2MB.</p>
                  </div>
                  {logoUploading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                </div>
                <input
                  id="onboard-logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
                    setLogoUploading(true);
                    try {
                      const formData = new FormData();
                      formData.append('file', file);
                      formData.append('type', 'logo');
                      const res = await fetch('/api/upload/onboarding', { method: 'POST', body: formData });
                      const data = await res.json();
                      if (res.ok && data.url) {
                        setLogoUrl(data.url);
                        toast.success('Logo uploaded');
                      } else {
                        toast.error(data.error || 'Upload failed');
                      }
                    } catch { toast.error('Upload failed'); }
                    finally { setLogoUploading(false); }
                  }}
                />
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
              } else if (role === 'realtor' && realtorStep > 0) {
                setRealtorStep(realtorStep - 1);
                setError('');
              } else {
                setRole('choose');
                setBrokerStep(0);
                setRealtorStep(0);
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
              {role === 'realtor' && (
                <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                  Step {realtorStep + 1} of {realtorTotalSteps}
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
            {role === 'realtor' && (
              <div className="flex gap-1 mb-4">
                {Array.from({ length: realtorTotalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${i <= realtorStep ? 'bg-primary' : 'bg-muted'}`}
                  />
                ))}
              </div>
            )}
            <h1 className="text-xl font-bold">
              {role === 'realtor'
                ? realtorStep === 0
                  ? 'Create your workspace'
                  : realtorStep === 1
                    ? 'Contact details'
                    : 'Preferences'
                : isBrokerRole
                  ? brokerStep === 0
                    ? role === 'broker_only' ? 'Create your brokerage' : 'Set up your brokerage'
                    : brokerStep === 1
                      ? 'Brokerage details'
                      : brokerStep === 2
                        ? 'Team info'
                        : brokerStep === 3
                          ? 'Business model'
                          : 'Preferences'
                  : 'Create your workspace'}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {role === 'realtor'
                ? realtorStep === 0
                  ? 'Give your workspace a name and we\'ll generate your intake link.'
                  : realtorStep === 1
                    ? 'Help clients reach you with a few contact details.'
                    : 'A couple quick questions to tailor your experience.'
                : isBrokerRole
                  ? brokerStep === 0
                    ? role === 'broker_only'
                      ? 'Set up your brokerage to manage your team of realtors.'
                      : 'Create your brokerage and personal workspace in one step.'
                    : brokerStep === 1
                      ? 'Add your brokerage logo, website, and office info.'
                      : brokerStep === 2
                        ? 'Tell us about your team and market focus.'
                        : brokerStep === 3
                          ? 'How does your brokerage operate?'
                          : 'A couple quick questions to tailor your experience.'
                  : 'Give your workspace a name and we\'ll generate your intake link.'}
            </p>
          </div>

          <form onSubmit={isBrokerRole ? handleBrokerNext : role === 'realtor' ? handleRealtorNext : handleSubmit} className="space-y-4">
            {/* Realtor step 0: workspace info */}
            {role === 'realtor' && realtorStep === 0 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="businessName">Business or brand name</Label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Preston Leasing"
                    required
                    autoFocus
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

            {/* Realtor step 1: Contact details */}
            {role === 'realtor' && realtorStep === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="realtorPhone">Phone number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="realtorPhone"
                      type="tel"
                      value={realtorPhone}
                      onChange={(e) => setRealtorPhone(e.target.value)}
                      placeholder="(305) 555-0100"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="realtorBio">Bio <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    id="realtorBio"
                    value={realtorBio}
                    onChange={(e) => setRealtorBio(e.target.value)}
                    placeholder="2-3 sentences about your specialties and experience"
                    maxLength={500}
                    rows={3}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="realtorWebsite">Website URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="realtorWebsite"
                      value={realtorWebsite}
                      onChange={(e) => setRealtorWebsite(e.target.value)}
                      placeholder="https://prestonleasing.com"
                      className="pl-9"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Realtor step 2: Preferences */}
            {role === 'realtor' && realtorStep === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Timezone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pl-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select timezone</option>
                      <option value="Eastern">Eastern</option>
                      <option value="Central">Central</option>
                      <option value="Mountain">Mountain</option>
                      <option value="Pacific">Pacific</option>
                      <option value="Alaska">Alaska</option>
                      <option value="Hawaii">Hawaii</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>How did you hear about Chippi? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid gap-2">
                    {['Referral', 'Google', 'Social Media', 'Word of Mouth', 'Other'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setHearAbout(option)}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border transition-all text-sm',
                          hearAbout === option
                            ? 'border-primary/40 bg-primary/5 font-medium shadow-sm'
                            : 'border-border hover:border-primary/30 text-muted-foreground'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Biggest pain point? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid gap-2">
                    {['Lead follow-up', 'Scheduling', 'Pipeline tracking', 'Paperwork'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPainPoint(option)}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border transition-all text-sm',
                          painPoint === option
                            ? 'border-primary/40 bg-primary/5 font-medium shadow-sm'
                            : 'border-border hover:border-primary/30 text-muted-foreground'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Broker step 0: Basic info (brokerage name + workspace for "both") */}
            {isBrokerRole && brokerStep === 0 && (
              <>
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

                {role === 'broker' && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="businessName">Your personal workspace name</Label>
                      <Input
                        id="businessName"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Preston Leasing"
                        required
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
              </>
            )}

            {/* Broker step 1: Brokerage details */}
            {isBrokerRole && brokerStep === 1 && (
              <>
                <div className="space-y-1.5">
                  <Label>Brokerage logo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div
                    className="relative flex items-center gap-3 rounded-lg border-2 border-dashed border-border p-3 hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => document.getElementById('broker-logo-onboard-upload')?.click()}
                  >
                    {brokerLogoUrl ? (
                      <img src={brokerLogoUrl} alt="Brokerage logo preview" className="h-10 max-w-[100px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                        <Image size={16} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{brokerLogoUrl ? 'Change logo' : 'Upload logo'}</p>
                      <p className="text-xs text-muted-foreground">PNG, JPG, WebP. Max 2MB.</p>
                    </div>
                    {brokerLogoUploading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                  </div>
                  <input
                    id="broker-logo-onboard-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
                      setBrokerLogoUploading(true);
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        formData.append('type', 'broker_logo');
                        const res = await fetch('/api/upload/onboarding', { method: 'POST', body: formData });
                        const data = await res.json();
                        if (res.ok && data.url) {
                          setBrokerLogoUrl(data.url);
                          toast.success('Logo uploaded');
                        } else {
                          toast.error(data.error || 'Upload failed');
                        }
                      } catch { toast.error('Upload failed'); }
                      finally { setBrokerLogoUploading(false); }
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="brokerWebsiteUrl">Website URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="brokerWebsiteUrl"
                      value={brokerWebsiteUrl}
                      onChange={(e) => setBrokerWebsiteUrl(e.target.value)}
                      placeholder="https://prestonrealty.com"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="officeAddress">Office address <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="officeAddress"
                      value={officeAddress}
                      onChange={(e) => setOfficeAddress(e.target.value)}
                      placeholder="123 Main St, Suite 100, Miami, FL 33130"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="officePhone">Office phone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="officePhone"
                      type="tel"
                      value={officePhone}
                      onChange={(e) => setOfficePhone(e.target.value)}
                      placeholder="(305) 555-0100"
                      className="pl-9"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Broker step 2: Team info */}
            {isBrokerRole && brokerStep === 2 && (
              <>
                <div className="space-y-2">
                  <Label>Number of agents <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: '1-5', label: '1 - 5' },
                      { value: '5-15', label: '5 - 15' },
                      { value: '15-50', label: '15 - 50' },
                      { value: '50+', label: '50+' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAgentCount(opt.value)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                          agentCount === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Brokerage type <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'independent', label: 'Independent' },
                      { value: 'franchise', label: 'Franchise' },
                      { value: 'virtual', label: 'Virtual' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setBrokerageType(opt.value)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                          brokerageType === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Primary market <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'residential_rental', label: 'Residential Rental' },
                      { value: 'commercial', label: 'Commercial' },
                      { value: 'mixed', label: 'Mixed' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPrimaryMarket(opt.value)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                          primaryMarket === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Broker step 3: Business model */}
            {isBrokerRole && brokerStep === 3 && (
              <>
                <div className="space-y-2">
                  <Label>Commission structure <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'flat_fee', label: 'Flat fee' },
                      { value: 'percentage_split', label: 'Percentage split' },
                      { value: 'hybrid', label: 'Hybrid' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setCommissionStructure(opt.value)}
                        className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                          commissionStructure === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground hover:border-primary/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="geographicCoverage">Geographic coverage <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="geographicCoverage"
                    value={geographicCoverage}
                    onChange={(e) => setGeographicCoverage(e.target.value)}
                    placeholder="e.g., Miami-Dade, Broward County"
                  />
                </div>
              </>
            )}

            {/* Broker step 4: Preferences */}
            {isBrokerRole && brokerStep === 4 && (
              <>
                <div className="space-y-2">
                  <Label>Timezone <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="relative">
                    <Clock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 pl-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Select timezone</option>
                      <option value="Eastern">Eastern</option>
                      <option value="Central">Central</option>
                      <option value="Mountain">Mountain</option>
                      <option value="Pacific">Pacific</option>
                      <option value="Alaska">Alaska</option>
                      <option value="Hawaii">Hawaii</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>How did you hear about Chippi? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid gap-2">
                    {['Referral', 'Google', 'Social Media', 'Word of Mouth', 'Other'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setHearAbout(option)}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border transition-all text-sm',
                          hearAbout === option
                            ? 'border-primary/40 bg-primary/5 font-medium shadow-sm'
                            : 'border-border hover:border-primary/30 text-muted-foreground'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Biggest pain point? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <div className="grid gap-2">
                    {['Lead follow-up', 'Scheduling', 'Pipeline tracking', 'Paperwork'].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setPainPoint(option)}
                        className={cn(
                          'w-full text-left px-4 py-3 rounded-xl border transition-all text-sm',
                          painPoint === option
                            ? 'border-primary/40 bg-primary/5 font-medium shadow-sm'
                            : 'border-border hover:border-primary/30 text-muted-foreground'
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertCircle size={14} className="text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Realtor next */}
            {role === 'realtor' && realtorStep < realtorTotalSteps - 1 && (
              <Button type="submit" className="w-full" disabled={!canAdvanceRealtorStep} size="lg">
                Continue
              </Button>
            )}

            {/* Realtor submit (final step) */}
            {role === 'realtor' && realtorStep === realtorTotalSteps - 1 && (
              <Button type="submit" className="w-full" disabled={!canSubmit} size="lg">
                {saving ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create workspace'
                )}
              </Button>
            )}

            {/* Broker next / submit */}
            {isBrokerRole && brokerStep < brokerTotalSteps - 1 && (
              <Button type="submit" className="w-full" disabled={!canAdvanceBrokerStep} size="lg">
                Continue
              </Button>
            )}

            {isBrokerRole && brokerStep === brokerTotalSteps - 1 && (
              <Button type="submit" className="w-full" disabled={!canSubmit} size="lg">
                {saving ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    {role === 'broker_only' ? 'Creating brokerage...' : 'Setting up...'}
                  </>
                ) : role === 'broker_only' ? (
                  <>
                    <Building2 size={16} className="mr-2" />
                    Create brokerage
                  </>
                ) : (
                  <>
                    <Users size={16} className="mr-2" />
                    Create brokerage & workspace
                  </>
                )}
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
