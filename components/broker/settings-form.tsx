'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface SettingsFormProps {
  name: string;
  websiteUrl: string | null;
  logoUrl: string | null;
  joinCode: string | null;
  isOwner: boolean;
}

export function BrokerageSettingsForm({
  name: initialName,
  websiteUrl: initialWebsite,
  logoUrl: initialLogo,
  joinCode,
  isOwner,
}: SettingsFormProps) {
  const [name, setName] = useState(initialName);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsite ?? '');
  const [logoUrl, setLogoUrl] = useState(initialLogo ?? '');
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
      {/* Lead distribution is handled manually via /broker/leads */}

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
