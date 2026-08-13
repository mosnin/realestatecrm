'use client';

/**
 * PluginsSkillsManager — the "make Chippi yours" half of the Plugins page.
 *
 * Two space-scoped lists with inline create forms:
 *   - Custom plugins: point Chippi at your own HTTP endpoint (an MLS wrapper,
 *     a brokerage service, a Zapier catch hook). The description teaches the
 *     model when to use it; every call is approval-gated in chat, and the
 *     auth header value is write-only (never shown again after save).
 *   - Skills: reusable playbook prompts you invoke from the composer's "/"
 *     menu. One optional {placeholder} becomes the initial selection.
 *
 * REST against /api/plugins and /api/skills; no realtime — these change
 * rarely and a refresh after mutation is honest.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SECTION_LABEL } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PluginRow {
  id: string;
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST';
  hasAuth: boolean;
  enabled: boolean;
}
interface SkillRow {
  id: string;
  title: string;
  description: string;
  prompt: string;
  enabled: boolean;
}

export function PluginsSkillsManager({ slug }: { slug: string }) {
  const router = useRouter();
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/plugins?slug=${encodeURIComponent(slug)}`),
        fetch(`/api/skills?slug=${encodeURIComponent(slug)}`),
      ]);
      if (!pRes.ok || !sRes.ok) throw new Error('Could not load plugins and skills.');
      setPlugins(((await pRes.json()) as { plugins: PluginRow[] }).plugins);
      setSkills(((await sRes.json()) as { skills: SkillRow[] }).skills);
      setHasLoaded(true);
    } catch {
      setLoadError('Plugins and skills could not be loaded. Try again.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-10" data-secondary-list="plugins-and-skills">
      {loadError && (
        <div role="alert" className="flex items-center justify-between gap-4 border-b border-border/60 pb-4 text-sm text-destructive">
          <span>{loadError}</span>
          <Button variant="outline" size="xs" onClick={() => { setLoading(true); void load(); }}>
            Try again
          </Button>
        </div>
      )}
      {hasLoaded && (
        <>
          <PluginsSection slug={slug} plugins={plugins} onChanged={() => void load()} />
          <SkillsSection slug={slug} skills={skills} onChanged={() => { void load(); router.refresh(); }} />
        </>
      )}
    </div>
  );
}

// ── Custom plugins ───────────────────────────────────────────────────────────

function PluginsSection({
  slug, plugins, onChanged,
}: { slug: string; plugins: PluginRow[]; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '', url: '', method: 'POST', authHeaderName: '', authHeaderValue: '' });

  async function create() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Could not create the plugin.');
        return;
      }
      setForm({ name: '', description: '', url: '', method: 'POST', authHeaderName: '', authHeaderValue: '' });
      setCreating(false);
      onChanged();
    } catch {
      setError('Could not create the plugin. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(p: PluginRow) {
    try {
      const res = await fetch(`/api/plugins/${p.id}?slug=${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      if (!res.ok) throw new Error('toggle_failed');
      onChanged();
    } catch {
      toast.error(`Could not turn ${p.name} ${p.enabled ? 'off' : 'on'}.`);
    }
  }

  async function remove(p: PluginRow) {
    if (!confirm(`Delete the "${p.name}" plugin? Chippi will no longer be able to call it.`)) return;
    try {
      const res = await fetch(`/api/plugins/${p.id}?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete_failed');
      onChanged();
    } catch {
      toast.error(`Could not delete ${p.name}.`);
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <p className={SECTION_LABEL}>Your plugins</p>
        {!creating && (
          <Button variant="outline" size="xs" onClick={() => setCreating(true)}>
            New plugin
          </Button>
        )}
      </div>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Point Chippi at your own API. Describe when to use it — Chippi asks before every call.
      </p>

      {creating && (
        <div className="mb-5 space-y-2.5 rounded-2xl bg-muted/30 p-4 sm:p-5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label htmlFor="plugin-name" className="sr-only">Plugin name</label>
            <Input
              id="plugin-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="name (e.g. mls-lookup)"
            />
            <select
              value={form.method}
              onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="HTTP method"
            >
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
          <Input
            aria-label="Plugin URL"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            placeholder="https://your-api.example.com/endpoint"
          />
          <Textarea
            aria-label="Plugin description and usage"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What it does and when Chippi should use it — e.g. “Look up live MLS status for an address. Use when I ask about listing status.”"
            rows={2}
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Input
              aria-label="Authentication header name"
              value={form.authHeaderName}
              onChange={(e) => setForm((f) => ({ ...f, authHeaderName: e.target.value }))}
              placeholder="Auth header name (optional, e.g. Authorization)"
            />
            <Input
              aria-label="Authentication header value"
              value={form.authHeaderValue}
              onChange={(e) => setForm((f) => ({ ...f, authHeaderValue: e.target.value }))}
              placeholder="Auth header value (stored, never shown again)"
              type="password"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setError(''); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : 'Add plugin'}
            </Button>
          </div>
        </div>
      )}

      {plugins.length === 0 && !creating ? (
        <div className="py-7">
          <p className="text-[13px] text-muted-foreground">
            No custom plugins yet. Add one and Chippi can call your own tools by name.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {plugins.map((p) => (
            <li key={p.id} className="group/row -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{p.name}</p>
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    {p.method}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.hasAuth ? 'Authenticated' : 'No authentication'}
                  </span>
                </div>
                <p className="truncate text-[12px] text-muted-foreground">{p.description}</p>
              </div>
              <button
                type="button"
                onClick={() => void toggle(p)}
                aria-pressed={p.enabled}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors',
                  p.enabled
                    ? 'border-transparent bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.09]'
                    : 'border-border/60 text-muted-foreground hover:text-foreground',
                )}
              >
                {p.enabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => void remove(p)}
                aria-label={`Delete ${p.name}`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Skills ───────────────────────────────────────────────────────────────────

function SkillsSection({
  slug, skills, onChanged,
}: { slug: string; skills: SkillRow[]; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', prompt: '' });

  async function create() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, ...form }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Could not create the skill.');
        return;
      }
      setForm({ title: '', description: '', prompt: '' });
      setCreating(false);
      onChanged();
    } catch {
      setError('Could not create the skill. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: SkillRow) {
    if (!confirm(`Delete the "${s.title}" skill?`)) return;
    try {
      const res = await fetch(`/api/skills/${s.id}?slug=${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete_failed');
      onChanged();
    } catch {
      toast.error(`Could not delete ${s.title}.`);
    }
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <p className={SECTION_LABEL}>Your skills</p>
        {!creating && (
          <Button variant="outline" size="xs" onClick={() => setCreating(true)}>
            New skill
          </Button>
        )}
      </div>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Reusable playbooks. Type <span className="rounded bg-muted px-1 font-mono text-[11px]">/</span> in
        chat to run one. Wrap one part in {'{curly braces}'} to make it the fill-in blank.
      </p>

      {creating && (
        <div className="mb-5 space-y-2.5 rounded-2xl bg-muted/30 p-4 sm:p-5">
          <Input
            aria-label="Skill name"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Name (e.g. Open-house follow-up)"
          />
          <Input
            aria-label="Skill description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="One line on what it does (shows in the / menu)"
          />
          <Textarea
            aria-label="Skill prompt"
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            placeholder="The prompt to run — e.g. “Draft warm follow-ups for everyone who visited the open house at {address}, mention one specific detail each.”"
            rows={3}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setError(''); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : 'Add skill'}
            </Button>
          </div>
        </div>
      )}

      {skills.length === 0 && !creating ? (
        <div className="py-7">
          <p className="text-[13px] text-muted-foreground">
            No saved skills yet. Turn the asks you repeat every week into one-tap plays.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {skills.map((s) => (
            <li key={s.id} className="group/row -mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="truncate text-[12px] text-muted-foreground">{s.description || s.prompt}</p>
              </div>
              <button
                type="button"
                onClick={() => void remove(s)}
                aria-label={`Delete ${s.title}`}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted/40 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
