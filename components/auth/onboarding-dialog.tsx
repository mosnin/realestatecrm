'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Loader2, AlertCircle, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Floating dialog that appears after sign-in/sign-up if the user
 * doesn't have a workspace yet. Replaces the /setup page.
 */
export function OnboardingDialog() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Workspace form state
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

        // If user has no space, show dialog
        if (!data.space?.slug) {
          setOpen(true);
        } else {
          // User already has a workspace — redirect
          router.push(`/s/${data.space.slug}`);
        }
      } catch {
        // Silent fail — user can still use sign-in
      } finally {
        setLoading(false);
      }
    }

    checkOnboarding();
  }, [isLoaded, isSignedIn, router]);

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
    const timer = setTimeout(() => checkSlug(slug), 400);
    return () => clearTimeout(timer);
  }, [slug, checkSlug]);

  const canSubmit =
    businessName.trim() && slug.length >= 3 && slugAvailable === true && !saving;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');

    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: '',
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
      if (!spaceRes.ok) throw new Error(spaceData.error || 'Failed to create workspace.');

      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });

      const resolvedSlug: string = spaceData.slug ?? slug;
      router.push(`/s/${resolvedSlug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      toast.error(msg);
      setSaving(false);
    }
  }

  if (!open || loading) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl shadow-amber-900/10 overflow-hidden">

          {/* Top accent */}
          <div className="h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-400" />

          <div className="px-7 pt-6 pb-7">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-semibold text-primary mb-3">
                  <Sparkles size={10} />
                  Almost there
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  Create your workspace
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Set up your business name and intake link to get started.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="onb-businessName" className="text-sm font-medium">
                  Business or brand name
                </Label>
                <Input
                  id="onb-businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Preston Leasing"
                  required
                  autoFocus
                />
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
                    Creating...
                  </>
                ) : (
                  'Create workspace'
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
