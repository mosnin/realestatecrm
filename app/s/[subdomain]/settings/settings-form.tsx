'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
};

interface SettingsFormProps {
  space: Space;
  settings: UserSettings | null;
}

export function SettingsForm({ space, settings }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [emoji, setEmoji] = useState(space.emoji);
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
          subdomain: space.subdomain,
          name,
          emoji,
          notifications,
          phoneNumber,
          myConnections,
          aiPersonalization,
          billingSettings
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
        body: JSON.stringify({ subdomain: space.subdomain })
      });
      router.push('/');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Workspace Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="emoji">Workspace Emoji</Label>
              <Input
                id="emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={10}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="number">Number</Label>
              <Input
                id="number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="connections">My Connections</Label>
              <Input
                id="connections"
                value={myConnections}
                onChange={(e) => setMyConnections(e.target.value)}
                placeholder="Brokerages, lenders, partners"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="aiPersonalization">AI Personalization</Label>
              <Input
                id="aiPersonalization"
                value={aiPersonalization}
                onChange={(e) => setAiPersonalization(e.target.value)}
                placeholder="Tone, writing style, playbooks"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="billingSettings">Billing Settings</Label>
              <Input
                id="billingSettings"
                value={billingSettings}
                onChange={(e) => setBillingSettings(e.target.value)}
                placeholder="Plan, payment method, billing contact"
              />
            </div>

            <div className="space-y-1">
              <Label>Subdomain</Label>
              <Input value={space.subdomain} disabled />
              <p className="text-xs text-muted-foreground">
                Subdomain cannot be changed after creation
              </p>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">Notifications</p>
                <p className="text-xs text-muted-foreground">
                  Receive updates about your space activity
                </p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Deleting your space is permanent and will remove all clients, deals,
            and data. This cannot be undone.
          </p>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Space'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
