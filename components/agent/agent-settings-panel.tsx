'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bot, Loader2, Play, CheckCircle2, Circle,
  Zap, Shield, Eye, UserCheck, Briefcase, Clock, TrendingUp, CalendarCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/formatting';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AgentSettings {
  spaceId: string;
  enabled: boolean;
  autonomyLevel: 'autonomous' | 'draft_required' | 'suggest_only';
  dailyTokenBudget: number;
  heartbeatIntervalMinutes: number;
  enabledAgents: string[];
  perAgentAutonomy: Record<string, 'autonomous' | 'draft_required' | 'suggest_only'>;
  confidenceThreshold: number;
}

interface AgentUsage {
  used: number;
  limit: number;
  pct: number;
  resetsAt: string;
}

interface AgentStatus {
  pendingDrafts: number;
  lastRunAt: string | null;
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
    iconClass: 'text-orange-500',
  },
] as const;

const AGENT_OPTIONS = [
  {
    value: 'lead_nurture',
    label: 'Lead Nurture',
    description: 'Drafts personalised follow-ups for leads not contacted in 7+ days.',
    icon: UserCheck,
    iconClass: 'text-orange-500',
  },
  {
    value: 'deal_sentinel',
    label: 'Deal Sentinel',
    description: 'Flags stalled deals and warns on approaching close dates.',
    icon: Briefcase,
    iconClass: 'text-orange-600',
  },
  {
    value: 'long_term_nurture',
    label: 'Long-Term Nurture',
    description: 'Re-engages cold leads at 30, 60, 90, and 180+ day intervals.',
    icon: Clock,
    iconClass: 'text-orange-400',
  },
  {
    value: 'lead_scorer',
    label: 'Lead Scorer',
    description: 'Re-scores contacts whose activity makes their current score stale.',
    icon: TrendingUp,
    iconClass: 'text-orange-500',
  },
  {
    value: 'tour_followup',
    label: 'Tour Follow-Up',
    description: 'Instantly drafts a personal follow-up when a contact completes a tour.',
    icon: CalendarCheck,
    iconClass: 'text-orange-500',
  },
] as const;

const AUTONOMY_ICONS = {
  suggest_only: Eye,
  draft_required: Shield,
  autonomous: Zap,
} as const;

const AUTONOMY_LABELS = {
  suggest_only: 'Suggest only',
  draft_required: 'Draft + approval',
  autonomous: 'Autonomous',
} as const;

const BUDGET_PRESETS = [
  { label: '10k', value: 10_000, desc: '~40 runs/day' },
  { label: '25k', value: 25_000, desc: '~100 runs/day' },
  { label: '50k', value: 50_000, desc: '~200 runs/day' },
  { label: '100k', value: 100_000, desc: '~400 runs/day' },
] as const;

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  const hrs = Math.floor(diff / 3_600_000);
  return hrs > 0 ? `${hrs}h` : 'soon';
}

interface Props { slug: string; }

export function AgentSettingsPanel({ slug }: Props) {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [usage, setUsage] = useState<AgentUsage | null>(null);
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [triggeringRun, setTriggeringRun] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, usageRes, draftsRes, activityRes] = await Promise.all([
      fetch('/api/agent/settings'),
      fetch('/api/agent/usage'),
      fetch('/api/agent/drafts?status=pending&limit=1'),
      fetch('/api/agent/activity?limit=1'),
    ]);
    if (settingsRes.ok) setSettings(await settingsRes.json());
    if (usageRes.ok) setUsage(await usageRes.json());

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
    setStatus({ pendingDrafts, lastRunAt });
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function saveField(patch: Partial<AgentSettings>, fieldKey: string) {
    if (!settings) return;
    const previous = settings;
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
      } else {
        setSettings(previous);
        toast.error('Failed to save setting — please try again');
      }
    } catch {
      setSettings(previous);
      toast.error('Could not reach server');
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
    void saveField({ enabledAgents: next }, `agent_${agent}`);
  }

  function setAgentAutonomy(agent: string, level: 'autonomous' | 'draft_required' | 'suggest_only' | null) {
    if (!settings) return;
    const next = { ...(settings.perAgentAutonomy ?? {}) };
    if (level === null) {
      delete next[agent];
    } else {
      next[agent] = level;
    }
    setSettings({ ...settings, perAgentAutonomy: next });
    void saveField({ perAgentAutonomy: next }, `autonomy_${agent}`);
  }

  async function triggerRun() {
    setTriggeringRun(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/agent/run-now', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { triggered: boolean; method?: string; note?: string };
        if (data.triggered) {
          setRunResult(data.method === 'modal' ? 'Run started!' : (data.note ?? 'Queued for next heartbeat'));
          // Refresh status after a moment
          setTimeout(() => void load(), 3000);
        } else {
          setRunResult('Could not trigger run — check Modal deployment');
        }
      }
    } catch {
      setRunResult('Network error');
    } finally {
      setTriggeringRun(false);
      setTimeout(() => setRunResult(null), 5000);
    }
  }

  if (loading || !settings) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((n) => <div key={n} className="h-20 rounded-lg bg-muted/40 animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Status + Run Now */}
      <div className="rounded-lg border border-border/70 bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
              settings.enabled
                ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400'
                : 'bg-muted text-muted-foreground',
            )}>
              <Bot size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">Background Agent</p>
                <span className={cn(
                  'text-[11px] font-semibold px-1.5 py-0.5 rounded-full',
                  settings.enabled
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                    : 'bg-muted text-muted-foreground',
                )}>
                  {settings.enabled ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {status?.lastRunAt
                  ? `Last run ${timeAgo(status.lastRunAt)} · every ${settings.heartbeatIntervalMinutes} min`
                  : 'No runs yet'}
                {status?.pendingDrafts ? ` · ${status.pendingDrafts} draft${status.pendingDrafts !== 1 ? 's' : ''} awaiting review` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 text-xs"
                onClick={() => void triggerRun()}
                disabled={triggeringRun || !settings.enabled}
              >
                {triggeringRun ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                Run now
              </Button>
              {runResult && (
                <p className="text-[11px] text-muted-foreground">{runResult}</p>
              )}
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => {
                if (!checked) {
                  // Turning OFF — require confirmation
                  setShowDisableConfirm(true);
                } else {
                  // Turning ON — save immediately
                  setSettings({ ...settings, enabled: true });
                  void saveField({ enabled: true }, 'enabled');
                }
              }}
            />
          </div>
        </div>

        {/* Token usage meter */}
        {usage && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Today&apos;s usage — {usage.used.toLocaleString()} / {usage.limit.toLocaleString()} tokens
              </span>
              <span className={cn(
                'font-medium',
                usage.pct >= 90 ? 'text-destructive' : usage.pct >= 70 ? 'text-amber-500' : 'text-muted-foreground',
              )}>
                {usage.pct}% · resets in {timeUntil(usage.resetsAt)}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  usage.pct >= 90 ? 'bg-destructive' : usage.pct >= 70 ? 'bg-amber-400' : 'bg-orange-500',
                )}
                style={{ width: `${usage.pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Autonomy level */}
      <div className="space-y-3">
        <div>
          <Label id="autonomy-label" className="text-sm font-semibold">How much should the agent do on its own?</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            We recommend starting with &quot;Draft + approval&quot; — you stay in control.
          </p>
        </div>
        <div role="radiogroup" aria-labelledby="autonomy-label" className="space-y-2">
          {AUTONOMY_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = settings.autonomyLevel === opt.value;
            return (
              <button
                key={opt.value}
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  setSettings({ ...settings, autonomyLevel: opt.value });
                  void saveField({ autonomyLevel: opt.value }, 'autonomyLevel');
                }}
                onKeyDown={(e) => {
                  const opts = AUTONOMY_OPTIONS.map(o => o.value);
                  const idx = opts.indexOf(settings.autonomyLevel);
                  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = opts[(idx + 1) % opts.length];
                    setSettings({ ...settings, autonomyLevel: next as typeof settings.autonomyLevel });
                    void saveField({ autonomyLevel: next as typeof settings.autonomyLevel }, 'autonomyLevel');
                  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = opts[(idx - 1 + opts.length) % opts.length];
                    setSettings({ ...settings, autonomyLevel: prev as typeof settings.autonomyLevel });
                    void saveField({ autonomyLevel: prev as typeof settings.autonomyLevel }, 'autonomyLevel');
                  }
                }}
                className={cn(
                  'w-full text-left p-4 rounded-lg border transition-colors',
                  selected ? 'border-orange-500 bg-orange-500/5 ring-1 ring-orange-500/20' : 'border-border/70 bg-card hover:bg-foreground/[0.04]',
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0', opt.iconClass)}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {selected
                        ? <CheckCircle2 size={14} className="text-orange-500 flex-shrink-0" />
                        : <Circle size={14} className="text-muted-foreground/40 flex-shrink-0" />}
                      <span className="text-sm font-medium">{opt.label}</span>
                      {'recommended' in opt && opt.recommended && (
                        <span className="text-[11px] bg-orange-500/10 text-orange-600 dark:text-orange-400 font-semibold px-1.5 py-0.5 rounded-full">
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

      {/* Confidence threshold */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Confidence threshold</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Drafts actions below this confidence score even in autonomous mode (0 = disabled)
            </p>
          </div>
          <span className="text-sm font-mono text-muted-foreground w-10 text-right">
            {settings.confidenceThreshold ?? 0}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={settings.confidenceThreshold ?? 0}
          onChange={(e) => {
            if (!settings) return;
            const v = parseInt(e.target.value, 10);
            if (!Number.isNaN(v)) setSettings({ ...settings, confidenceThreshold: v });
          }}
          onMouseUp={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            if (!Number.isNaN(v)) void saveField({ confidenceThreshold: v }, 'confidenceThreshold');
          }}
          onTouchEnd={(e) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            void saveField({ confidenceThreshold: v }, 'confidenceThreshold');
          }}
          className="w-full accent-orange-500"
          disabled={saving}
        />
        {savedField === 'confidenceThreshold' && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 size={11} /> Saved
          </span>
        )}
      </div>

      {/* Active agents */}
      <div className="space-y-3">
        <div>
          <Label className="text-sm font-semibold">Active agents</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Each agent inherits the workspace autonomy level above. Override per-agent when enabled.
          </p>
        </div>
        <div className="space-y-2">
          {AGENT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const isEnabled = (settings.enabledAgents ?? []).includes(opt.value);
            const override = (settings.perAgentAutonomy ?? {})[opt.value] as
              'autonomous' | 'draft_required' | 'suggest_only' | undefined;
            const effective = override ?? settings.autonomyLevel;

            return (
              <div key={opt.value} className="rounded-lg border border-border/70 bg-card space-y-0">
                {/* Top row */}
                <div className="flex items-center gap-4 p-4">
                  <div className={cn('w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center flex-shrink-0', opt.iconClass)}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={() => toggleAgent(opt.value)}
                    disabled={saving}
                  />
                </div>

                {/* Per-agent autonomy row — only when enabled */}
                {isEnabled && (
                  <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border">
                    <span className="text-xs text-muted-foreground flex-shrink-0">Autonomy</span>
                    <div className="flex items-center rounded-lg border border-border overflow-hidden ml-auto">
                      {(['suggest_only', 'draft_required', 'autonomous'] as const).map((level) => {
                        const LevelIcon = AUTONOMY_ICONS[level];
                        const isSelected = effective === level;
                        const isWorkspaceDefault = settings.autonomyLevel === level && !override;
                        return (
                          <button
                            key={level}
                            title={AUTONOMY_LABELS[level] + (isWorkspaceDefault ? ' (workspace default)' : '')}
                            aria-label={`Set to ${AUTONOMY_LABELS[level] ?? level}`}
                            onClick={() => setAgentAutonomy(opt.value, level === override ? null : level)}
                            className={cn(
                              'flex items-center gap-1 px-2.5 py-2 min-h-[36px] text-xs transition-colors border-r border-border last:border-r-0',
                              isSelected && override
                                ? 'bg-orange-500 text-white'
                                : isSelected
                                ? 'bg-muted text-foreground'
                                : 'hover:bg-muted/40 text-muted-foreground',
                            )}
                          >
                            <LevelIcon size={11} />
                            {isWorkspaceDefault && !override && (
                              <span className="w-1 h-1 rounded-full bg-orange-500 inline-block flex-shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {override && (
                      <button
                        onClick={() => setAgentAutonomy(opt.value, null)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        title="Reset to workspace default"
                      >
                        Reset
                      </button>
                    )}
                    {savedField === `autonomy_${opt.value}` && (
                      <span className="text-xs text-emerald-600 flex items-center gap-1 flex-shrink-0">
                        <CheckCircle2 size={11} /> Saved
                      </span>
                    )}
                  </div>
                )}
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
            Limits OpenAI usage per day for this workspace. Resets at midnight UTC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {BUDGET_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                setSettings({ ...settings, dailyTokenBudget: preset.value });
                void saveField({ dailyTokenBudget: preset.value }, 'budget');
              }}
              className={cn(
                'flex flex-col items-center px-4 py-2.5 rounded-lg border text-sm transition-all',
                settings.dailyTokenBudget === preset.value
                  ? 'border-orange-500 bg-orange-500/5 text-orange-600 dark:text-orange-400 font-semibold ring-1 ring-orange-500/20'
                  : 'border-border/70 bg-card text-foreground hover:bg-foreground/[0.04]',
              )}
            >
              <span className="font-bold">{preset.label}</span>
              <span className="text-[11px] text-muted-foreground mt-0.5">{preset.desc}</span>
            </button>
          ))}
        </div>
        {savedField === 'budget' && (
          <p className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 size={11} /> Saved</p>
        )}
      </div>

      <AlertDialog open={showDisableConfirm} onOpenChange={setShowDisableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable agent?</AlertDialogTitle>
            <AlertDialogDescription>
              Chippi will stop all autonomous actions. You can re-enable at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep enabled</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSettings({ ...settings, enabled: false });
                void saveField({ enabled: false }, 'enabled');
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
