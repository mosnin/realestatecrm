'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';

interface AgentSettings {
  enabled: boolean;
  dailyTokenBudget: number;
  autonomyLevel: 'suggest_only' | 'draft_required' | 'autonomous';
}

/** One place to see each sending policy. These settings have different scopes;
 * no single toggle claims to stop jobs governed by another saved policy. */
export function AgentSettingsPanel({ slug }: { slug: string }) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [firstTouch, setFirstTouch] = useState<boolean | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [agentRes, spaceRes, activityRes] = await Promise.all([
        fetch('/api/agent/settings'),
        fetch(`/api/spaces?slug=${encodeURIComponent(slug)}`),
        fetch('/api/agent/activity?limit=1'),
      ]);
      if (!agentRes.ok) throw new Error('Settings unavailable');
      setSettings(await agentRes.json());
      if (spaceRes.ok) {
        const space = await spaceRes.json();
        setFirstTouch((space.settings ?? space).autoFirstTouchSend !== false);
      } else setFirstTouch(null);
      if (activityRes.ok) {
        const activity = await activityRes.json();
        setLastActivity(activity[0]?.createdAt ?? null);
      }
    } catch {
      setLoadError(true);
    }
  }, [slug]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(patch: Partial<AgentSettings>) {
    setSaving(true);
    try {
      const res = await fetch('/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      setSettings(await res.json());
      toast.success('Sending policy saved');
    } catch {
      toast.error('Could not save. Your previous setting is still in place.');
    } finally {
      setSaving(false);
    }
  }

  async function saveFirstTouch(enabled: boolean) {
    setSaving(true);
    try {
      const res = await fetch('/api/spaces', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, autoFirstTouchSend: enabled }),
      });
      if (!res.ok) throw new Error('Save failed');
      setFirstTouch(enabled);
      toast.success('First response policy saved');
    } catch {
      toast.error('Could not save. Your previous setting is still in place.');
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      const data = await res.json();
      setRunResult(
        data.note ??
          (res.ok && data.triggered
            ? 'Run request accepted. Check Activity for the result.'
            : 'Could not start this run. Check Activity and your connections.'),
      );
    } catch {
      setRunResult(
        'Start could not be confirmed. Check Activity before trying again.',
      );
    } finally {
      setRunning(false);
    }
  }

  if (loadError)
    return (
      <div role="alert" className="rounded-lg border border-border p-5 text-sm">
        <p>
          Could not load sending policies. Your saved preferences have not
          changed.
        </p>
        <Button variant="outline" className="mt-3" onClick={() => void load()}>
          Try again
        </Button>
      </div>
    );
  if (!settings)
    return (
      <p role="status" className="py-6 text-sm text-muted-foreground">
        Loading sending policies…
      </p>
    );

  return (
    <div className="max-w-2xl space-y-7">
      <div>
        <h2 className="text-xl font-semibold">What runs automatically</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Connect your inbox, choose the work you want handled, and review the
          results in Activity.
        </p>
      </div>
      <section className="divide-y divide-border rounded-lg border border-border px-5">
        <div className="flex items-start justify-between gap-5 py-5">
          <div>
            <h3 className="text-sm font-semibold">
              First response to new leads
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Send the first reply when a new lead arrives. When off, prepare it
              for review.
            </p>
          </div>
          {firstTouch === null ? (
            <button className="text-sm text-brand" onClick={() => void load()}>
              Reload policy
            </button>
          ) : (
            <Switch
              aria-label="Send first responses automatically"
              disabled={saving}
              checked={firstTouch}
              onCheckedChange={(value) => void saveFirstTouch(value)}
            />
          )}
        </div>
        <div className="flex items-start justify-between gap-5 py-5">
          <div>
            <h3 className="text-sm font-semibold">Follow-up sequences</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Send due steps from your enrolled sequences. When off, save those
              messages for review.
            </p>
            <Link
              href={`/s/${slug}/automations`}
              className="mt-2 inline-flex text-sm font-medium text-brand"
            >
              Manage follow-ups →
            </Link>
          </div>
          <Switch
            aria-label="Send sequence follow-ups automatically"
            disabled={saving}
            checked={settings.autonomyLevel === 'autonomous'}
            onCheckedChange={(value) =>
              void save({
                autonomyLevel: value ? 'autonomous' : 'draft_required',
              })
            }
          />
        </div>
        <div className="py-5">
          <h3 className="text-sm font-semibold">Your saved automations</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Each automation follows its own sending policy and schedule. An
            explicit send instruction runs automatically; an explicit draft
            instruction creates a draft.
          </p>
          <Link
            href={`/s/${slug}/automations#workflows`}
            className="mt-2 inline-flex text-sm font-medium text-brand"
          >
            Review active automations →
          </Link>
        </div>
        <div className="py-5">
          <h3 className="text-sm font-semibold">Tasks you give Chippi</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Chippi carries out the actions you request. Use Review changes in a
            task when you want to approve each change.
          </p>
        </div>
      </section>
      <section className="rounded-lg border border-border p-5">
        <div className="flex items-start justify-between gap-5">
          <div>
            <h3 className="text-sm font-semibold">Background review</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Look for leads and follow-ups that need attention. This controls
              the periodic review, separate from the sending policies above.
            </p>
          </div>
          <Switch
            aria-label="Enable periodic background review"
            disabled={saving}
            checked={settings.enabled}
            onCheckedChange={(value) => void save({ enabled: value })}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={running || !settings.enabled}
            onClick={() => void runNow()}
          >
            {running ? (
              <Loader2 size={14} className="mr-2 animate-spin" />
            ) : (
              <Play size={14} className="mr-2" />
            )}
            Review now
          </Button>
          <Link
            href={`/s/${slug}/chippi/activity`}
            className="text-sm font-medium text-brand"
          >
            Activity →
          </Link>
          {lastActivity && (
            <span className="text-xs text-muted-foreground">
              Last recorded activity {timeAgo(lastActivity)}
            </span>
          )}
        </div>
        {runResult && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {runResult}
          </p>
        )}
      </section>
      <div className="flex flex-wrap gap-5 text-sm font-medium text-brand">
        <Link href={`/s/${slug}/chippi/integrations`}>
          Manage connected apps →
        </Link>
        <Link href={`/s/${slug}/chippi/inbox`}>Review waiting messages →</Link>
      </div>
      <details className="rounded-lg border border-border p-5">
        <summary className="cursor-pointer text-sm font-medium">
          Background review budget
        </summary>
        <p className="mt-3 text-sm text-muted-foreground">
          Daily token limit for the periodic review. Chat and saved automations
          use your workspace credits.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[10000, 25000, 50000, 100000].map((value) => (
            <Button
              key={value}
              variant={
                settings.dailyTokenBudget === value ? 'default' : 'outline'
              }
              size="sm"
              disabled={saving}
              onClick={() => void save({ dailyTokenBudget: value })}
            >
              {value.toLocaleString()} tokens
            </Button>
          ))}
        </div>
      </details>
    </div>
  );
}
