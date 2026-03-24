'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Building2,
  Link2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

const STEPS = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'intake', label: 'Intake link' },
] as const;

/**
 * Inline multi-step onboarding that replaces the Clerk form area
 * after sign-in when the user has no workspace yet.
 */
export function OnboardingFlow() {
  const router = useRouter();
  const { isSignedIn, isLoaded, user: clerkUser } = useUser();

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Check if user needs onboarding
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }

    async function checkOnboarding() {
      try {
        const res = await fetch('/api/onboarding');
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();

        if (data.completed && data.space?.slug) {
          // Already onboarded — skip straight to workspace
          router.push(`/s/${data.space.slug}`);
        } else if (data.space?.slug) {
          // Has space but onboarding not marked complete — still redirect
          router.push(`/s/${data.space.slug}`);
        } else {
          setShow(true);
        }
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    }

    checkOnboarding();
  }, [isLoaded, isSignedIn, router]);

  // Auto-derive slug
  useEffect(() => {
    if (!businessName.trim()) { setSlug(''); return; }
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
    if (!slug) return;
    const timer = setTimeout(() => checkSlug(slug), 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  async function handleComplete() {
    setSaving(true);
    setError('');

    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: clerkUser?.fullName ?? '',
          phone: '',
          businessName,
        }),
      });

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
          // Slug was taken between availability check and create — let user pick another
          setSlugAvailable(false);
          setError('That slug was just taken. Please pick a different one.');
          setSaving(false);
          return;
        }
        throw new Error(spaceData.error || 'Failed to create workspace.');
      }

      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });

      router.push(`/s/${spaceData.slug ?? slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      toast.error(msg);
      setSaving(false);
    }
  }

  async function handleSkip() {
    setSaving(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      });
      if (!res.ok) throw new Error('Failed to skip');
      router.push('/setup');
    } catch {
      toast.error('Something went wrong. Please try again.');
      setSaving(false);
    }
  }

  if (!show || loading) return null;

  const firstName = clerkUser?.firstName ?? 'there';

  return (
    <div className="w-full">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < step
                  ? 'bg-primary text-primary-foreground'
                  : i === step
                  ? 'bg-foreground text-white'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < step ? <CheckCircle2 size={14} /> : i + 1}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                i === step ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 ${i < step ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0 — Welcome */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary mb-4">
              <Sparkles size={10} />
              Let&apos;s get started
            </div>
            <h2 className="text-xl font-semibold tracking-tight">
              Hey {firstName}, welcome to Chippi!
            </h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We&apos;ll set up your workspace in a few quick steps. You&apos;ll get a custom intake
              link to start capturing and qualifying renter leads right away.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: Building2, text: 'Name your workspace' },
              { icon: Link2, text: 'Create your intake link' },
              { icon: Sparkles, text: 'Start managing leads' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Icon size={15} className="text-foreground" />
                </div>
                {text}
              </div>
            ))}
          </div>

          <Button
            onClick={() => setStep(1)}
            className="w-full"
            size="lg"
          >
            Get started <ArrowRight size={15} className="ml-1" />
          </Button>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
          >
            Skip for now
          </button>
        </div>
      )}

      {/* Step 1 — Business name */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              What&apos;s your business called?
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              This is how your workspace will appear to you and your clients.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onb-name" className="text-sm font-medium">
              Business or brand name
            </Label>
            <Input
              id="onb-name"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Preston Leasing"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(0)}
              size="lg"
              className="flex-1"
            >
              <ArrowLeft size={15} className="mr-1" /> Back
            </Button>
            <Button
              onClick={() => setStep(2)}
              disabled={!businessName.trim()}
              size="lg"
              className="flex-1"
            >
              Continue <ArrowRight size={15} className="ml-1" />
            </Button>
          </div>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
          >
            Skip for now
          </button>
        </div>
      )}

      {/* Step 2 — Intake link */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Create your intake link
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              This is the link you&apos;ll share with renters. They&apos;ll use it to submit applications.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="onb-slug" className="text-sm font-medium">
              Intake link slug
            </Label>
            <div className="relative">
              <Input
                id="onb-slug"
                value={slug}
                onChange={(e) =>
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
                placeholder="preston-leasing"
                className="pr-8"
                autoFocus
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
              <p className="text-xs text-muted-foreground break-all mt-1">
                chippi.com/apply/{slug}
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle size={14} className="text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              size="lg"
              className="flex-1"
            >
              <ArrowLeft size={15} className="mr-1" /> Back
            </Button>
            <Button
              onClick={handleComplete}
              disabled={!slug || slug.length < 3 || slugAvailable !== true || saving}
              size="lg"
              className="flex-1"
            >
              {saving ? (
                <>
                  <Loader2 size={15} className="mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create workspace <Sparkles size={14} className="ml-1" />
                </>
              )}
            </Button>
          </div>
          <button
            onClick={handleSkip}
            disabled={saving}
            className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  );
}
