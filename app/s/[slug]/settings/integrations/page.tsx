'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Copy, Check, Loader2, Plus, Trash2, Key } from 'lucide-react';

type McpKey = { id: string; name: string; keyPrefix: string; clientId?: string; lastUsedAt: string | null; createdAt: string };

function CredentialRow({ label, value, show, onCopy, copied }: { label: string; value: string; show: boolean; onCopy: () => void; copied: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-9 rounded-lg border bg-white dark:bg-background px-3 flex items-center overflow-hidden">
          <span className="text-sm font-mono select-all truncate">{show ? value : '\u2022'.repeat(Math.min(value.length, 40))}</span>
        </div>
        <button type="button" className="h-9 px-3 rounded-lg border text-xs font-medium hover:bg-muted transition-colors flex items-center gap-1" onClick={async () => { await navigator.clipboard.writeText(value); onCopy(); }}>
          {copied ? '\u2713 Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function IntegrationsSettingsPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? '';

  const MCP_ENDPOINT = 'https://my.usechippi.com/api/mcp';
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

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/mcp-keys?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setMcpKeys(d.keys ?? []))
      .catch(() => setMcpKeys([]))
      .finally(() => setMcpKeysLoading(false));
  }, [slug]);

  async function handleCreateMcpKey() {
    if (!mcpNewKeyName.trim()) return;
    setMcpCreating(true);
    try {
      const res = await fetch('/api/mcp-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, name: mcpNewKeyName.trim() }),
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
        body: JSON.stringify({ slug, id }),
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground text-sm">Connect external AI tools to your workspace via MCP and manage API keys</p>
      </div>

      {/* MCP Connection Info */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/20">
          <p className="font-semibold text-sm">MCP Connection Info</p>
          <p className="text-xs text-muted-foreground mt-0.5">Connect external AI tools via the Model Context Protocol.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>MCP Endpoint</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-9 rounded-lg border border-input bg-muted/40 px-3 flex items-center">
                <span className="text-sm font-mono select-all">{MCP_ENDPOINT}</span>
              </div>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={async () => { await navigator.clipboard.writeText(MCP_ENDPOINT); setMcpCopiedEndpoint(true); setTimeout(() => setMcpCopiedEndpoint(false), 2000); }}>
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
            <div className="text-sm text-muted-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground text-xs mb-1">Claude Desktop / Cursor / Windsurf</p>
                <p className="text-xs mb-1.5">Add to your MCP config file:</p>
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
              </div>
              <div>
                <p className="font-medium text-foreground text-xs mb-1">Claude.ai (Web)</p>
                <p className="text-xs">Go to Claude &rarr; Settings &rarr; MCP &rarr; Add Remote Server. Enter:</p>
                <ul className="text-xs mt-1 space-y-0.5 list-disc list-inside">
                  <li>URL: <span className="font-mono">{MCP_ENDPOINT}</span></li>
                  <li>Leave Client ID and Client Secret empty</li>
                  <li>After adding, Claude will redirect to Chippi to authorize</li>
                </ul>
              </div>
              <p className="text-xs">Generate an API key below and replace <span className="font-mono">YOUR_API_KEY</span> with it.</p>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">API Keys</p>
            <p className="text-xs text-muted-foreground mt-0.5">Manage keys for MCP and API access.</p>
          </div>
          {!mcpShowForm && !mcpNewCreds && (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setMcpShowForm(true)}>
              <Plus size={12} /> Generate new key
            </Button>
          )}
        </div>
        <div className="px-6 py-5 space-y-4">
          {/* New credentials reveal */}
          {mcpNewCreds && (
            <div className="rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Your MCP credentials</p>
                <button type="button" onClick={() => setMcpShowSecrets(!mcpShowSecrets)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  {mcpShowSecrets ? 'Hide' : 'Show'}
                </button>
              </div>
              <CredentialRow label="MCP Server URL" value={MCP_ENDPOINT} show={true} onCopy={() => { setMcpCopiedField('url'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'url'} />
              <CredentialRow label="OAuth Client ID" value={mcpNewCreds.clientId} show={mcpShowSecrets} onCopy={() => { setMcpCopiedField('clientId'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'clientId'} />
              <CredentialRow label="OAuth Client Secret" value={mcpNewCreds.clientSecret} show={mcpShowSecrets} onCopy={() => { setMcpCopiedField('secret'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'secret'} />
              <CredentialRow label="API Key (alternative)" value={mcpNewCreds.key} show={mcpShowSecrets} onCopy={() => { setMcpCopiedField('key'); setTimeout(() => setMcpCopiedField(null), 2000); }} copied={mcpCopiedField === 'key'} />
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">These credentials won&apos;t be shown again. Copy them now.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => { setMcpNewCreds(null); setMcpShowForm(false); setMcpShowSecrets(false); }}>Dismiss</Button>
            </div>
          )}

          {/* Inline create form */}
          {mcpShowForm && !mcpNewCreds && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
              <Label htmlFor="mcp-key-name">Key name</Label>
              <div className="flex items-center gap-2">
                <Input id="mcp-key-name" value={mcpNewKeyName} onChange={(e) => setMcpNewKeyName(e.target.value)} placeholder='e.g. "Claude Desktop" or "Cursor"' className="flex-1" />
                <Button type="button" size="sm" className="h-9" disabled={mcpCreating || !mcpNewKeyName.trim()} onClick={handleCreateMcpKey}>
                  {mcpCreating ? <Loader2 size={13} className="animate-spin" /> : 'Create'}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setMcpShowForm(false); setMcpNewKeyName(''); }}>Cancel</Button>
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
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeleteMcpKey(k.id)} disabled={mcpDeletingId === k.id} title="Delete key">
                    {mcpDeletingId === k.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
