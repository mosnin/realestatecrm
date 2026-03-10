'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Space } from '@prisma/client';

type UserSettings = {
  notifications?: boolean;
  phoneNumber?: string | null;
  myConnections?: string | null;
  aiPersonalization?: string | null;
  billingSettings?: string | null;
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
      <div className="px-6 py-5 space-y-4">
        {children}
      </div>
    </div>
  );
}

export function SettingsForm({ space, settings }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [notifications, setNotifications] = useState(
    settings?.notifications ?? true
  );
  const [phoneNumber, setPhoneNumber] = useState(settings?.phoneNumber ?? '');
  const [myConnections, setMyConnections] = useState(settings?.myConnections ?? '');
  const [aiPersonalization, setAiPersonalization] = useState(
    settings?.aiPersonalization ?? ''
  );
  const [billingSettings, setBillingSettings] = useState(
    settings?.billingSettings ?? ''
  );
  const [anthropicApiKey, setAnthropicApiKey] = useState(
    settings?.anthropicApiKey ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`/api/spaces`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: space.slug,
          name,
          notifications,
          phoneNumber,
          myConnections,
          aiPersonalization,
          billingSettings,
          anthropicApiKey
        })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Are you sure you want to delete "${space.name}"? This will permanently delete all clients, deals, and data. This cannot be undone.`
      )
    )
      return;

    setDeleting(true);
    try {
      await fetch(`/api/spaces`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug })
      });
      router.push('/');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-2xl">
      {/* Workspace */}
      <SectionBlock title="Workspace" description="Your workspace name and slug.">
        <div className="space-y-1.5">
          <Label htmlFor="name">Workspace name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Slug</Label>
          <Input value={space.slug} disabled />
          <p className="text-xs text-muted-foreground">Slug cannot be changed after creation.</p>
        </div>
      </SectionBlock>

      {/* Contact */}
      <SectionBlock title="Contact & connections" description="Your phone number and partner connections visible to AI context.">
        <div className="space-y-1.5">
          <Label htmlFor="number">Phone number</Label>
          <Input
            id="number"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="connections">My connections</Label>
          <Input
            id="connections"
            value={myConnections}
            onChange={(e) => setMyConnections(e.target.value)}
            placeholder="Brokerages, lenders, partners"
          />
        </div>
      </SectionBlock>

      {/* AI */}
      <SectionBlock title="AI configuration" description="Keys and personalization for the AI assistant.">
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3.5 space-y-1">
          <p className="text-xs font-medium">AI & Vector Keys</p>
          <p className="text-xs text-muted-foreground">
            Only an optional Anthropic key is stored here. OpenAI and Zilliz credentials are project-level environment variables — set <code className="font-mono">OPENAI_API_KEY</code>, <code className="font-mono">ZILLIZ_URI</code>, and <code className="font-mono">ZILLIZ_TOKEN</code> in Vercel.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="anthropicApiKey">Anthropic API key</Label>
          <Input
            id="anthropicApiKey"
            type="password"
            value={anthropicApiKey}
            onChange={(e) => setAnthropicApiKey(e.target.value)}
            placeholder="sk-ant-..."
          />
          <p className="text-xs text-muted-foreground">Required for the AI Assistant. Get your key at console.anthropic.com.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="aiPersonalization">AI personalization</Label>
          <Input
            id="aiPersonalization"
            value={aiPersonalization}
            onChange={(e) => setAiPersonalization(e.target.value)}
            placeholder="Tone, writing style, playbooks"
          />
        </div>
      </SectionBlock>

      {/* Notifications */}
      <SectionBlock title="Notifications" description="Control how you receive updates about workspace activity.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Email notifications</p>
            <p className="text-xs text-muted-foreground mt-0.5">Receive updates about your space activity</p>
          </div>
          <Switch
            checked={notifications}
            onCheckedChange={setNotifications}
          />
        </div>
      </SectionBlock>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save settings'}
        </Button>
        {saved && <p className="text-sm text-primary">Changes saved.</p>}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/30 bg-card overflow-hidden mt-8">
        <div className="px-6 py-4 border-b border-destructive/20 bg-destructive/5">
          <p className="font-semibold text-sm text-destructive">Danger zone</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted-foreground mb-4">
            Deleting your space is permanent and will remove all clients, deals, and data. This cannot be undone.
          </p>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete space'}
          </Button>
        </div>
      </div>
    </form>
  );
}
