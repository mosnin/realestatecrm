'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bot, Loader2, Save, Play, CheckCircle2, Circle,
  Zap, Shield, Eye, UserCheck, Briefcase,
} from 'lucide-react';
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

interface AgentStatus {
  pendingDrafts: number;
  lastRunAt: string | null;
  totalActionsToday: number;
}

const AUTONOMY_OPTIONS = [
  {
    value: 'suggest_only' as const,
    label: 'Suggest only',
    description: 'Logs observations and highlights opportunities — no changes made.',
    icon: Eye,
    iconClass: 'text-muted-foreground',
  },
  {
    value: 'draft_required' as const,
    label: 'Draft + approval',
    description: 'Creates draft messages for your review. Nothing is sent without your sign-off.',
    icon: Shield,
    iconClass: 'text-amber-500',
    recommended: true,
  },
  {
    value: 'autonomous' as const,
    label: 'Autonomous',
    description: 'Schedules follow-ups and takes low-risk actions automatically.',
    icon: Zap,
    iconClass: 'text-blue-500',
  },
] as const;

const AGENT_OPTIONS = [
  {
    value: 'lead_nurture',
    label: 'Lead Nurture Agent',
    description: 'Identifies leads that haven\'t been contacted in 7+ days and drafts personalised follow-ups.',
    icon: UserCheck,
    iconClass: 'text-emerald-500',
  },
  {
    value: 'deal_sentinel',
    label: 'Deal Sentinel Agent',
    description: 'Flags stalled deals, warns on approaching close dates, schedules reminders.',
    icon: Briefcase,
    iconClass: 'text-violet-500',
  },
] as const;

const BUDGET_PRESETS = [
  { label: '10k', value: 10_000, desc: '~40 checks/day' },
  { label: '25k', value: 25_000, desc: '~100 checks/day' },
  { label: '50k', value: 50_000, desc: '~200 checks/day' },
  { label: '100k', value: 100_000, desc: '~400 checks/day' },
] as const;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface Props { slug: string; }

export function AgentSettingsPanel({ slug }: Props) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [triggeringRun, setTriggeringRun] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, draftsRes, activityRes] = await Promise.all([
      fetch('/api/agent/settings'),
      fetch('/api/agent/drafts?status=pending&limit=1'),
      fetch('/api/agent/activity?limit=1'),
    ]);
    if (settingsRes.ok) setSettings(await settingsRes.json());

    // Build status from available data
    let pendingDrafts = 0;
    if (draftsRes.ok) {
      const drafts = await draftsRes.json();
      pendingDrafts = Array.isArray(drafts) ? drafts.length : 0;
    }
    let lastRunAt: string | null = null;
    if (activityRes.ok) {
      const activity = await activityRes.json();
      lastRunAt = activity[0]?.createdAt ?? null;
    }
    setStatus({ pendingDrafts, lastRunAt, totalActionsToday: 0 });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveField(patch: Partial<AgentSettings>, fieldKey: string) {
    if (!settings) return;
    setSaving(true);
    const merged = { ...settings, ...patch };
    try {
      const res = await fetch('/api/agent/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (res.ok) {
        setSettings(await res.json());
        setSavedField(fieldKey);
        setTimeout(() => setSavedField(null), 2000);
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
    const updated = { ...settings, enabledAgents: next };
    setSettings(updated);
    saveField({ enabledAgents: next }, `agent_${agent}`);
  }

  async function triggerRun() {
    setTriggeringRun(true);
    // In production this would call Modal's API to trigger a run.
    // For now show a helpful message with the CLI command.
    await new Promise((r) => setTimeout(r, 800));
    setTriggeringRun(false);
    alert('To trigger a manual run:\n\nmodal run agent/modal_app.py\n\nor target a specific space:\n\nmodal run agent/modal_app.py --space-id YOUR_SPACE_ID');
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((n) => <div key={n} className="h-20 rounded-xl bg-muted/40 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status widget */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
              settings.enabled ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
            )}>
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Background Agent</p>
                <span className={cn(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                  settings.enabled
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {settings.enabled ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {status?.lastRunAt
                  ? `Last run ${timeAgo(status.lastRunAt)} · runs every ${settings.heartbeatIntervalMinutes} min`
                  : 'No runs yet'}
                {status?.pendingDrafts ? ` · ${status.pendingDrafts} draft${status.pendingDrafts !== 1 ? 's' : ''} awaiting review` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={triggerRun}
              disabled={triggeringRun || !settings.enabled}
            >
              {triggeringRun ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              Run now
            </Button>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => {
                setSettings({ ...settings, enabled: v });
                saveField({ enabled: v }, 'enabled');
              }}
            />
          </div>
        </div>
      </div>

      {/* Autonomy level */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">How much should the agent do on its own?</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            You can change this at any time. We recommend starting with "Draft + approval".
          </p>
        </div>
        <div className="space-y-2">
          {AUTONOMY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = settings.autonomyLevel === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => {
                  setSettings({ ...settings, autonomyLevel: opt.value });
                  saveField({ autonomyLevel: opt.value }, 'autonomyLevel');
                }}
                className={cn(
                  'w-full text-left p-4 rounded-xl border transition-all',
                  selected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:bg-muted/40',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0', opt.iconClass)}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {selected
                        ? <CheckCircle2 size={14} className="text-primary flex-shrink-0" />
                        : <Circle size={14} className="text-muted-foreground/40 flex-shrink-0" />
                      }
                      <span className="text-sm font-medium">{opt.label}</span>
                      {'recommended' in opt && opt.recommended && (
                        <span className="text-[10px] bg-primary/10 text-primary font-semibold px-1.5 py-0.5 rounded-full">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-5">{opt.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {savedField === 'autonomyLevel' && (
          <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Saved</p>
        )}
      </div>

      {/* Active agents */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Active agents</Label>
        <div className="space-y-2">
          {AGENT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const enabled = (settings.enabledAgents ?? []).includes(opt.value);
            return (
              <div
                key={opt.value}
                className="flex items-center gap-4 p-4 rounded-xl border bg-card"
              >
                <div className={cn('w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0', opt.iconClass)}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => toggleAgent(opt.value)}
                  disabled={saving}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily token budget */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Daily token budget</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Limits how much OpenAI usage the agent can consume per day for this workspace. Resets at midnight UTC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                setSettings({ ...settings, dailyTokenBudget: preset.value });
                saveField({ dailyTokenBudget: preset.value }, 'budget');
              }}
              className={cn(
                'flex flex-col items-center px-4 py-2.5 rounded-xl border text-sm transition-all',
                settings.dailyTokenBudget === preset.value
                  ? 'border-primary bg-primary/5 text-primary font-semibold ring-1 ring-primary/20'
                  : 'border-border bg-card text-foreground hover:bg-muted/40',
              )}
            >
              <span className="font-bold">{preset.label}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{preset.desc}</span>
            </button>
          ))}
        </div>
        {savedField === 'budget' && (
          <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Saved</p>
        )}
      </div>
    </div>
  );
}
