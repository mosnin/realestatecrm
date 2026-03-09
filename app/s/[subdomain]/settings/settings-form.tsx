'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import type { Space } from '@prisma/client';

type UserSettings = {
  notifications?: boolean;
  phoneNumber?: string | null;
  aiPersonalization?: string | null;
  anthropicApiKey?: string | null;
};

interface SettingsFormProps {
  space: Space;
  settings: UserSettings | null;
}

function SectionBlock({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-muted/20">
        <p className="font-semibold text-sm">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

type NameState = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export function SettingsForm({ space, settings }: SettingsFormProps) {
  const router = useRouter();

  const [name, setName]           = useState(space.name);
  const [nameState, setNameState] = useState<NameState>('idle');
  const [notifications, setNotifications] = useState(settings?.notifications ?? true);
  const [phoneNumber, setPhoneNumber]     = useState(settings?.phoneNumber ?? '');
  const [aiPersonalization, setAiPersonalization] = useState(settings?.aiPersonalization ?? '');
  const [anthropicApiKey, setAnthropicApiKey]     = useState(settings?.anthropicApiKey ?? '');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced name uniqueness check
  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === space.name) {
      setNameState('idle');
      return;
    }
    setNameState('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/spaces?action=check_name&name=${encodeURIComponent(trimmed)}&subdomain=${space.subdomain}`);
        if (res.ok) {
          const { available } = await res.json() as { available: boolean };
          setNameState(available ? 'available' : 'taken');
        } else {
          setNameState('error');
        }
      } catch {
        setNameState('error');
      }
    }, 450);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [name, space.name, space.subdomain]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (nameState === 'taken') { setSaveError('That workspace name is already taken.'); return; }
    if (nameState === 'checking') { setSaveError('Still checking name availability…'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subdomain: space.subdomain,
          name: name.trim(),
          notifications,
          phoneNumber,
          aiPersonalization,
          anthropicApiKey,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setSaveError(body.error ?? 'Save failed. Please try again.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${space.name}"? This permanently removes all clients, deals, and data. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch('/api/spaces', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain: space.subdomain }),
      });
      router.push('/');
    } finally {
      setDeleting(false);
    }
  }

  const nameChanged = name.trim() !== space.name;
  const canSave = nameState !== 'taken' && nameState !== 'checking';

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-2xl">

      {/* Workspace */}
      <SectionBlock title="Workspace" description="Your workspace display name. Names must be unique across all accounts.">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Workspace name</Label>
          <div className="relative">
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={
                nameState === 'taken'     ? 'border-destructive focus-visible:ring-destructive/30' :
                nameState === 'available' ? 'border-primary focus-visible:ring-primary/30' : ''
              }
            />
            {nameChanged && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {nameState === 'checking'  && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                {nameState === 'available' && <CheckCircle2 size={14} className="text-primary" />}
                {nameState === 'taken'     && <AlertCircle size={14} className="text-destructive" />}
              </div>
            )}
          </div>
          {nameState === 'taken'     && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle size={11} />That name is already taken. Please choose another.</p>}
          {nameState === 'available' && nameChanged && <p className="text-xs text-primary flex items-center gap-1"><CheckCircle2 size={11} />Name is available.</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Subdomain</Label>
          <Input value={space.subdomain} disabled className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Subdomain cannot be changed after creation.</p>
        </div>
      </SectionBlock>

      {/* Contact */}
      <SectionBlock title="Contact" description="Your phone number for applicant follow-ups.">
        <div className="space-y-1.5">
          <Label htmlFor="ws-phone">Phone number</Label>
          <Input
            id="ws-phone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
      </SectionBlock>

      {/* AI */}
      <SectionBlock title="AI assistant" description="Credentials and personalization for the AI chat feature.">
        <div className="space-y-1.5">
          <Label htmlFor="ws-key">Anthropic API key</Label>
          <Input
            id="ws-key"
            type="password"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
          <p className="text-xs text-muted-foreground">
            Required for the AI assistant. Get yours at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
              console.anthropic.com
            </a>.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-persona">AI personalization</Label>
          <Input
            id="ws-persona"
            value={aiPersonalization}
            onChange={(e) => setAiPersonalization(e.target.value)}
            placeholder="Preferred tone, writing style, playbooks..."
          />
        </div>
      </SectionBlock>

      {/* Notifications */}
      <SectionBlock title="Notifications">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Email notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">Get notified when a new application is submitted</p>
          </div>
          <Switch checked={notifications} onCheckedChange={setNotifications} />
        </div>
      </SectionBlock>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={saving || !canSave}>
          {saving ? <><Loader2 size={14} className="animate-spin mr-2" />Saving…</> : saved ? 'Saved!' : 'Save settings'}
        </Button>
        {saved && <p className="text-sm text-primary">Changes saved.</p>}
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 bg-card overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-destructive/20 bg-destructive/5">
          <p className="font-semibold text-sm text-destructive">Danger zone</p>
        </div>
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Delete this workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently deletes all clients, deals, and data. Cannot be undone.
            </p>
          </div>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-shrink-0">
            {deleting ? 'Deleting…' : 'Delete workspace'}
          </Button>
        </div>
      </div>
    </form>
  );
}
