'use client';

import { useEffect, useState } from 'react';
import { Bot, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface AgentSettings {
  spaceId: string;
  enabled: boolean;
  autonomyLevel: 'autonomous' | 'draft_required' | 'suggest_only';
  dailyTokenBudget: number;
  heartbeatIntervalMinutes: number;
  enabledAgents: string[];
}

const AUTONOMY_OPTIONS = [
  {
    value: 'suggest_only',
    label: 'Suggest only',
    description: 'Agent logs observations and recommendations. No actions taken.',
  },
  {
    value: 'draft_required',
    label: 'Draft + approval',
    description: 'Agent creates draft messages. You approve before anything is sent.',
  },
  {
    value: 'autonomous',
    label: 'Autonomous',
    description: 'Agent schedules follow-ups and takes low-risk actions automatically.',
  },
] as const;

const AGENT_OPTIONS = [
  {
    value: 'lead_nurture',
    label: 'Lead Nurture Agent',
    description: 'Monitors leads, drafts follow-up messages, schedules reminders.',
  },
  {
    value: 'deal_sentinel',
    label: 'Deal Sentinel Agent',
    description: 'Watches the pipeline for stalled deals and upcoming close dates.',
  },
] as const;

interface Props {
  slug: string;
}

export function AgentSettingsPanel({ slug }: Props) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/agent/settings')
      .then((r) => r.json())
      .then(setSettings)
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleAgent(agent: string) {
    if (!settings) return;
    const current = settings.enabledAgents ?? [];
    const next = current.includes(agent)
      ? current.filter((a) => a !== agent)
      : [...current, agent];
    setSettings({ ...settings, enabledAgents: next });
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 size={20} className="animate-spin mr-2" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      {/* Enable toggle */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <Bot size={18} />
          </div>
          <div>
            <p className="font-medium text-sm">Enable background agent</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Runs every 15 minutes to monitor your CRM.
            </p>
          </div>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
        />
      </div>

      {/* Autonomy level */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Autonomy level</Label>
        <div className="space-y-2">
          {AUTONOMY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSettings({ ...settings, autonomyLevel: opt.value })}
              className={cn(
                'w-full text-left p-3.5 rounded-xl border transition-colors',
                settings.autonomyLevel === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0',
                    settings.autonomyLevel === opt.value
                      ? 'border-primary bg-primary'
                      : 'border-muted-foreground',
                  )}
                />
                <span className="text-sm font-medium">{opt.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 ml-5">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Enabled agents */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Active agents</Label>
        <div className="space-y-2">
          {AGENT_OPTIONS.map((opt) => {
            const enabled = (settings.enabledAgents ?? []).includes(opt.value);
            return (
              <div
                key={opt.value}
                className="flex items-center justify-between gap-4 p-3.5 rounded-xl border bg-card"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
                <Switch checked={enabled} onCheckedChange={() => toggleAgent(opt.value)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily token budget */}
      <div className="space-y-2">
        <Label htmlFor="budget" className="text-sm font-medium">Daily token budget</Label>
        <p className="text-xs text-muted-foreground">
          Maximum OpenAI tokens the agent can use per day for this workspace. 50,000 ≈ ~200 lead checks.
        </p>
        <input
          id="budget"
          type="number"
          min={1000}
          max={500000}
          step={1000}
          value={settings.dailyTokenBudget}
          onChange={(e) =>
            setSettings({ ...settings, dailyTokenBudget: parseInt(e.target.value) || 50000 })
          }
          className="w-40 h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Button onClick={save} disabled={saving} className="gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saved ? 'Saved!' : 'Save settings'}
      </Button>
    </div>
  );
}
