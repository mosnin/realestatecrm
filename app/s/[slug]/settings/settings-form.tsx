'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CheckCircle2, Loader2, Copy, Check, Trash2, Plus, Key } from 'lucide-react';
import type { Space } from '@/lib/types';

type UserSettings = {
  notifications?: boolean;
  smsNotifications?: boolean;
  notifyNewLeads?: boolean;
  notifyTourBookings?: boolean;
  notifyNewDeals?: boolean;
  notifyFollowUps?: boolean;
  phoneNumber?: string | null;
  myConnections?: string | null;
};

interface SettingsFormProps {
  space: Space;
  settings: UserSettings | null;
  userEmail: string;
}

function CredentialRow({ label, value, show, onCopy, copied }: { label: string; value: string; show: boolean; onCopy: () => void; copied: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 rounded-lg border bg-white dark:bg-background px-3 flex items-center overflow-hidden">
          <span className="text-sm font-mono select-all truncate">
            {show ? value : '•'.repeat(Math.min(value.length, 40))}
          </span>
        </div>
        <button
          type="button"
          className="h-9 px-3 rounded-lg border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1"
          onClick={async () => { await navigator.clipboard.writeText(value); onCopy(); }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
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

export function SettingsForm({ space, settings, userEmail }: SettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(space.name);
  const [newSlug, setNewSlug] = useState(space.slug);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const checkSlug = useCallback(async (value: string) => {
    if (value === space.slug) { setSlugAvailable(null); return; }
    if (value.length < 3) { setSlugAvailable(null); return; }
    setCheckingSlug(true);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_slug', slug: value }),
      });
      const data = await res.json();
      setSlugAvailable(data.available);
    } finally {
      setCheckingSlug(false);
    }
  }, [space.slug]);

  useEffect(() => {
    const timer = setTimeout(() => checkSlug(newSlug), 400);
    return () => clearTimeout(timer);
  }, [newSlug, checkSlug]);

  const slugChanged = newSlug !== space.slug;
  const slugValid = !slugChanged || (slugChanged && newSlug.length >= 3 && slugAvailable === true);

  const [notifications, setNotifications] = useState(
    settings?.notifications ?? true
  );
  const [smsNotifications, setSmsNotifications] = useState(
    settings?.smsNotifications ?? false
  );
  const [notifyNewLeads, setNotifyNewLeads] = useState(settings?.notifyNewLeads ?? true);
  const [notifyTourBookings, setNotifyTourBookings] = useState(settings?.notifyTourBookings ?? true);
  const [notifyNewDeals, setNotifyNewDeals] = useState(settings?.notifyNewDeals ?? true);
  const [notifyFollowUps, setNotifyFollowUps] = useState(settings?.notifyFollowUps ?? true);
  const [phoneNumber, setPhoneNumber] = useState(settings?.phoneNumber ?? '');
  const [myConnections, setMyConnections] = useState(settings?.myConnections ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // MCP / Integrations state
  type McpKey = { id: string; name: string; keyPrefix: string; clientId?: string; lastUsedAt: string | null; createdAt: string };
  const [mcpKeys, setMcpKeys] = useState<McpKey[]>([]);
  const [mcpKeysLoading, setMcpKeysLoading] = useState(true);
  const [mcpNewKeyName, setMcpNewKeyName] = useState('');
  const [mcpCreating, setMcpCreating] = useState(false);
  const [mcpNewCreds, setMcpNewCreds] = useState<{ key: string; clientId: string; clientSecret: string } | null>(null);
  const [mcpShowForm, setMcpShowForm] = useState(false);
  const [mcpCopiedEndpoint, setMcpCopiedEndpoint] = useState(false);
  const [mcpCopiedField, setMcpCopiedField] = useState<string | null>(null);
  const [mcpDeletingId, setMcpDeletingId] = useState<string | null>(null);
  const [mcpShowSecrets, setMcpShowSecrets] = useState(false);

  const MCP_ENDPOINT = 'https://my.usechippi.com/api/mcp';
  const TOKEN_ENDPOINT = 'https://my.usechippi.com/api/mcp/oauth/token';

  useEffect(() => {
    fetch(`/api/mcp-keys?slug=${encodeURIComponent(space.slug)}`)
      .then((r) => r.json())
      .then((d) => setMcpKeys(d.keys ?? []))
      .catch(() => setMcpKeys([]))
      .finally(() => setMcpKeysLoading(false));
  }, [space.slug]);

  async function handleCreateMcpKey() {
    if (!mcpNewKeyName.trim()) return;
    setMcpCreating(true);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug, name: mcpNewKeyName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setMcpNewCreds({ key: data.key, clientId: data.clientId, clientSecret: data.clientSecret });
        setMcpKeys((prev) => [{ id: data.id, name: data.name, keyPrefix: data.keyPrefix, clientId: data.clientId, lastUsedAt: null, createdAt: data.createdAt }, ...prev]);
        setMcpNewKeyName('');
      } else {
        alert(data.error ?? 'Failed to create API key.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setMcpCreating(false);
    }
  }

  async function handleDeleteMcpKey(id: string) {
    if (!confirm('Are you sure you want to delete this API key? Any integrations using it will stop working.')) return;
    setMcpDeletingId(id);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug, id }),
      });
      if (res.ok) {
        setMcpKeys((prev) => prev.filter((k) => k.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? 'Failed to delete key.');
      }
    } catch {
      alert('Network error. Please try again.');
    } finally {
      setMcpDeletingId(null);
    }
  }

  const anyChannelOn = notifications || smsNotifications;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/spaces`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: space.slug,
          newSlug: slugChanged ? newSlug : undefined,
          name,
          notifications,
          smsNotifications,
          notifyNewLeads,
          notifyTourBookings,
          notifyNewDeals,
          notifyFollowUps,
          phoneNumber,
          myConnections,
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setSlugAvailable(false);
          setSaveError('That slug was just taken. Please pick a different one.');
          return;
        }
        setSaveError(data.error || 'Failed to save settings. Please try again.');
        return;
      }
      const updated = await res.json().catch(() => ({}));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // If slug changed, navigate to the new URL
      if (slugChanged && updated.slug) {
        router.replace(`/s/${updated.slug}/settings`);
      } else {
        router.refresh();
      }
    } catch {
      setSaveError('Network error. Please check your connection and try again.');
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
      const res = await fetch(`/api/spaces`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: space.slug })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete workspace. Please try again.');
        return;
      }
      router.push('/');
    } catch {
      alert('Network error. Please check your connection and try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
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
          <Label htmlFor="slug">Slug</Label>
          <div className="relative">
            <Input
              id="slug"
              value={newSlug}
              onChange={(e) =>
                setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              }
              className="pr-8"
            />
            {slugChanged && newSlug.length >= 3 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingSlug ? (
                  <Loader2 size={14} className="animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <CheckCircle2 size={14} className="text-green-500 dark:text-green-400" />
                ) : slugAvailable === false ? (
                  <span className="text-red-500 dark:text-red-400 text-xs font-medium">taken</span>
                ) : null}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Your intake link: chippi.com/apply/{newSlug}
          </p>
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
          <p className="text-xs text-muted-foreground">
            Used for SMS notifications and displayed on tour booking pages
          </p>
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

      {/* Notifications */}
      <SectionBlock title="Notifications" description="Choose how and when you get notified about workspace activity.">
        {/* Delivery channels */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Delivery channels</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notifications sent to <span className="font-medium text-foreground">{userEmail}</span>
                </p>
              </div>
              <Switch
                checked={notifications}
                onCheckedChange={setNotifications}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">SMS</p>
                {phoneNumber ? (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Text messages sent to <span className="font-medium text-foreground">{phoneNumber}</span>
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Add your phone number above to enable SMS
                  </p>
                )}
              </div>
              <Switch
                checked={smsNotifications}
                onCheckedChange={setSmsNotifications}
                disabled={!phoneNumber}
              />
            </div>
          </div>
        </div>

        {/* Per-event toggles */}
        {anyChannelOn && (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Event types</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New leads</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When a new lead application is submitted
                  </p>
                </div>
                <Switch
                  checked={notifyNewLeads}
                  onCheckedChange={setNotifyNewLeads}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Tour bookings</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When a guest books a property tour
                  </p>
                </div>
                <Switch
                  checked={notifyTourBookings}
                  onCheckedChange={setNotifyTourBookings}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">New deals</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When a new deal is created in your pipeline
                  </p>
                </div>
                <Switch
                  checked={notifyNewDeals}
                  onCheckedChange={setNotifyNewDeals}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Follow-up reminders</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Daily digest of contacts due for follow-up
                  </p>
                </div>
                <Switch
                  checked={notifyFollowUps}
                  onCheckedChange={setNotifyFollowUps}
                />
              </div>
            </div>
          </div>
        )}

        {!anyChannelOn && (
          <p className="text-xs text-muted-foreground italic pt-2">
            Enable at least one delivery channel to configure event notifications.
          </p>
        )}
      </SectionBlock>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving || !slugValid}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save settings'}
          </Button>
          {saved && <p className="text-sm text-primary">Changes saved.</p>}
        </div>
        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
      </div>

      {/* Integrations & MCP */}
      <SectionBlock title="Integrations & MCP" description="Connect external AI tools to your workspace via the Model Context Protocol.">
        {/* MCP Connection Info */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">MCP Connection Info</p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>MCP Endpoint</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 rounded-lg border border-input bg-muted/40 px-3 flex items-center">
                  <span className="text-sm font-mono select-all">{MCP_ENDPOINT}</span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={async () => {
                    await navigator.clipboard.writeText(MCP_ENDPOINT);
                    setMcpCopiedEndpoint(true);
                    setTimeout(() => setMcpCopiedEndpoint(false), 2000);
                  }}
                >
                  {mcpCopiedEndpoint ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  {mcpCopiedEndpoint ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Transport</Label>
              <p className="text-sm text-muted-foreground">Streamable HTTP</p>
            </div>
            <div className="space-y-1.5">
              <Label>How to connect</Label>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Add this server to your MCP client configuration:</p>
                <div className="rounded-lg border border-input bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre">{`{
  "mcpServers": {
    "chippi": {
      "url": "${MCP_ENDPOINT}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`}</div>
                <p className="text-xs">Works with Claude Desktop, Cursor, Windsurf, and any MCP-compatible client. Generate an API key below and replace <span className="font-mono">YOUR_API_KEY</span> with it.</p>
              </div>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">API Keys</p>
            {!mcpShowForm && !mcpNewCreds && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setMcpShowForm(true)}
              >
                <Plus size={12} />
                Generate new key
              </Button>
            )}
          </div>

          {/* New credentials reveal */}
          {mcpNewCreds && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-4 mb-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Your MCP credentials</p>
                <button
                  type="button"
                  onClick={() => setMcpShowSecrets(!mcpShowSecrets)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {mcpShowSecrets ? '🙈 Hide' : '👁 Show'}
                </button>
              </div>

              {/* MCP URL */}
              <CredentialRow label="MCP Server URL" value={MCP_ENDPOINT} show={true} onCopy={() => { setMcpCopiedField('url'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'url'} />

              {/* OAuth Client ID */}
              <CredentialRow label="OAuth Client ID" value={mcpNewCreds.clientId} show={mcpShowSecrets} onCopy={() => { setMcpCopiedField('clientId'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'clientId'} />

              {/* OAuth Client Secret */}
              <CredentialRow label="OAuth Client Secret" value={mcpNewCreds.clientSecret} show={mcpShowSecrets} onCopy={() => { setMcpCopiedField('secret'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'secret'} />

              {/* API Key (for direct Bearer auth) */}
              <CredentialRow label="API Key (alternative)" value={mcpNewCreds.key} show={mcpShowSecrets} onCopy={() => { setMcpCopiedField('key'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'key'} />

              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">These credentials won&apos;t be shown again. Copy them now.</p>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium">To connect in Claude:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Go to Claude → Settings → MCP Connectors → Add</li>
                  <li>Name: <span className="font-mono">Chippi CRM</span></li>
                  <li>Remote MCP server URL: <span className="font-mono">{MCP_ENDPOINT}</span></li>
                  <li>OAuth Client ID: paste your Client ID</li>
                  <li>OAuth Client Secret: paste your Client Secret</li>
                </ol>
              </div>

              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => { setMcpNewCreds(null); setMcpShowForm(false); setMcpShowSecrets(false); }}>
                Dismiss
              </Button>
            </div>
          )}

          {/* Inline create form */}
          {mcpShowForm && !mcpNewCreds && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 mb-3 space-y-2">
              <Label htmlFor="mcp-key-name">Key name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mcp-key-name"
                  value={mcpNewKeyName}
                  onChange={(e) => setMcpNewKeyName(e.target.value)}
                  placeholder='e.g. "Claude Desktop" or "Cursor"'
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  disabled={mcpCreating || !mcpNewKeyName.trim()}
                  onClick={handleCreateMcpKey}
                >
                  {mcpCreating ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => { setMcpShowForm(false); setMcpNewKeyName(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Keys list */}
          {mcpKeysLoading ? (
            <div className="h-16 rounded-lg bg-muted animate-pulse" />
          ) : mcpKeys.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No API keys yet. Generate one to connect your MCP client.</p>
          ) : (
            <div className="space-y-2">
              {mcpKeys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Key size={14} className="text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{k.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{k.keyPrefix}...</span>
                        <span>&#183;</span>
                        <span>Created {new Date(k.createdAt).toLocaleDateString()}</span>
                        {k.lastUsedAt && (
                          <>
                            <span>&#183;</span>
                            <span>Last used {new Date(k.lastUsedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDeleteMcpKey(k.id)}
                    disabled={mcpDeletingId === k.id}
                    title="Delete key"
                  >
                    {mcpDeletingId === k.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionBlock>

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
