'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type DistributionMethod = 'round-robin' | 'score-based' | 'workload-balanced';

interface SettingsFormProps {
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  joinCode: string | null;
  isOwner: boolean;
  autoAssignEnabled?: boolean;
  autoAssignMethod?: DistributionMethod;
}

export function BrokerageSettingsForm({
  name: initialName,
  websiteUrl: initialWebsite,
  logoUrl: initialLogo,
  joinCode,
  isOwner,
  autoAssignEnabled: initialAutoAssign = false,
  autoAssignMethod: initialMethod = 'round-robin',
}: SettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsite ?? '');
  const [logoUrl, setLogoUrl] = useState(initialLogo ?? '');
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(initialAutoAssign);
  const [autoAssignMethod, setAutoAssignMethod] = useState<DistributionMethod>(initialMethod);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOwner) return;
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch('/api/broker/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          websiteUrl: websiteUrl.trim() || null,
          logoUrl: logoUrl.trim() || null,
          autoAssignEnabled,
          autoAssignMethod,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaved(true);
        toast.success('Settings saved');
        setTimeout(() => setSaved(false), 2000);
      } else {
        toast.error(data.error ?? 'Failed to save');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="brokerage-name">Brokerage name</Label>
        <Input
          id="brokerage-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          disabled={!isOwner}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="website-url">Website URL</Label>
        <Input
          id="website-url"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://example.com"
          maxLength={500}
          disabled={!isOwner}
        />
        <p className="text-xs text-muted-foreground">Optional. Shown on your brokerage profile.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="logo-url">Logo URL</Label>
        <Input
          id="logo-url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://example.com/logo.png"
          maxLength={500}
          disabled={!isOwner}
        />
        <p className="text-xs text-muted-foreground">Optional. Displayed on invite pages and emails.</p>
      </div>

      {joinCode && (
        <div className="space-y-1.5">
          <Label>Join Code</Label>
          <div className="flex items-center gap-2">
            <Input
              value={joinCode}
              readOnly
              disabled
              className="font-mono tracking-widest"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Current invite code. Manage it in the Invite Code section below.
          </p>
        </div>
      )}

      {/* ── Lead Distribution ─────────────────────────────────────────── */}
      <div className="pt-3 border-t border-border mt-2">
        <p className="text-sm font-semibold mb-3">Lead Distribution</p>

        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <Label htmlFor="auto-assign-toggle">Auto-assign new leads</Label>
            <p className="text-xs text-muted-foreground">
              Automatically distribute incoming leads to realtors
            </p>
          </div>
          <button
            id="auto-assign-toggle"
            type="button"
            role="switch"
            aria-checked={autoAssignEnabled}
            disabled={!isOwner}
            onClick={() => setAutoAssignEnabled(!autoAssignEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              autoAssignEnabled ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                autoAssignEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {autoAssignEnabled && (
          <div className="space-y-1.5">
            <Label htmlFor="distribution-method">Distribution method</Label>
            <select
              id="distribution-method"
              value={autoAssignMethod}
              onChange={(e) => setAutoAssignMethod(e.target.value as DistributionMethod)}
              disabled={!isOwner}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="round-robin">Round-robin</option>
              <option value="score-based">Score-based (highest score gets best agent)</option>
              <option value="workload-balanced">Workload-balanced (fewest active leads)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {autoAssignMethod === 'round-robin' && 'Leads are distributed evenly across all realtors in order.'}
              {autoAssignMethod === 'score-based' && 'Hot leads (score 70+) go to top-performing realtors. Others use round-robin.'}
              {autoAssignMethod === 'workload-balanced' && 'Each new lead goes to the realtor with the fewest active leads.'}
            </p>
          </div>
        )}
      </div>

      {logoUrl && /^https?:\/\/.+/i.test(logoUrl) && (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground mb-2">Logo preview</p>
          <img
            src={logoUrl}
            alt="Brokerage logo"
            className="h-12 max-w-[200px] object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {isOwner && (
        <Button type="submit" size="sm" disabled={saving || !name.trim()}>
          {saving ? (
            <><Loader2 size={14} className="mr-1.5 animate-spin" /> Saving...</>
          ) : saved ? (
            <><CheckCircle2 size={14} className="mr-1.5" /> Saved</>
          ) : (
            'Save changes'
          )}
        </Button>
      )}

      {!isOwner && (
        <p className="text-xs text-muted-foreground">Only the brokerage owner or admins can edit these settings.</p>
      )}
    </form>
  );
}
