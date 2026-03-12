'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BrandLogo } from '@/components/brand-logo';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function CreateWorkspaceForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      // Save profile (name only for now)
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_profile',
          name: defaultName,
          phone: '',
          businessName,
        }),
      });

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
      if (!spaceRes.ok) throw new Error(spaceData.error || 'Failed to create workspace.');

      // Mark onboarding complete so user is never redirected back here
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

  return (
    <div className="min-h-screen bg-background flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <BrandLogo className="h-7" alt="Chippi" />
        </div>

        <div className="rounded-xl border border-border bg-card px-6 py-7">
          <div className="mb-6">
            <h1 className="text-xl font-bold">Create your workspace</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Give your workspace a name and we&apos;ll generate your intake link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
  );
}
