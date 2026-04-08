'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Sparkles,
  Save,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  Info,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { IntakeFormConfig, FormQuestion } from './types';
import type { ScoringModel, QuestionScoringModel, NumberRange } from '@/lib/scoring/scoring-model-types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScoringTabProps {
  config: IntakeFormConfig;
  slug: string;
  leadType: 'rental' | 'buyer';
  scoringModel: ScoringModel | null;
  onScoringModelChange: (model: ScoringModel) => void;
  onSave: (model: ScoringModel) => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SYSTEM_FIELD_IDS = new Set(['name', 'email', 'phone']);

function isScorableQuestion(q: FormQuestion): boolean {
  if (q.system) return false;
  if (SYSTEM_FIELD_IDS.has(q.id)) return false;
  return true;
}

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function weightBarColor(weight: number): string {
  if (weight >= 20) return 'bg-emerald-500';
  if (weight >= 10) return 'bg-amber-500';
  if (weight >= 5) return 'bg-orange-400';
  return 'bg-gray-300';
}

function scoreBarColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-amber-500';
  if (score >= 25) return 'bg-orange-400';
  return 'bg-red-400';
}

// ── Question Scoring Card ────────────────────────────────────────────────────

function QuestionCard({
  question,
  model,
  enabled,
  onToggle,
  onWeightChange,
  onOptionScoreChange,
  onRangeChange,
  onAddRange,
  onRemoveRange,
}: {
  question: FormQuestion;
  model: QuestionScoringModel | undefined;
  enabled: boolean;
  onToggle: () => void;
  onWeightChange: (delta: number) => void;
  onOptionScoreChange: (optValue: string, score: number) => void;
  onRangeChange: (idx: number, field: keyof NumberRange, value: number | string | null) => void;
  onAddRange: () => void;
  onRemoveRange: (idx: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const weight = model?.weight ?? 0;
  const hasOptions = question.options && question.options.length > 0;
  const hasRanges = model?.ranges && model.ranges.length > 0;
  const showDetails = hasOptions || hasRanges;
  const sectionTitle = question.label;

  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        enabled
          ? 'border-border bg-card'
          : 'border-border/40 bg-muted/30 opacity-60',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="flex-shrink-0"
        />

        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium truncate', !enabled && 'text-muted-foreground')}>
            {sectionTitle}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
              {question.type}
            </Badge>
            {question.required && (
              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 text-amber-600 border-amber-200 bg-amber-50">
                Required
              </Badge>
            )}
          </div>
        </div>

        {/* Weight display + controls */}
        {enabled && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onWeightChange(-5)}
              disabled={weight <= 0}
              className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
            >
              <Minus size={12} />
            </button>
            <span className="text-lg font-bold tabular-nums text-primary min-w-[40px] text-center">
              {weight}%
            </span>
            <button
              type="button"
              onClick={() => onWeightChange(5)}
              disabled={weight >= 100}
              className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-30"
            >
              <Plus size={12} />
            </button>
          </div>
        )}

        {/* Expand toggle for details */}
        {enabled && showDetails && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {/* Weight bar */}
      {enabled && (
        <div className="px-4 pb-3">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all duration-300', weightBarColor(weight))}
              style={{ width: `${weight}%` }}
            />
          </div>
        </div>
      )}

      {/* Expanded details */}
      {enabled && expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Option scores for radio/select */}
          {hasOptions && model?.optionScores && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Option Scores
              </p>
              {question.options!.map((opt) => {
                const score = model.optionScores?.[opt.value] ?? 0;
                return (
                  <div key={opt.value} className="flex items-center gap-3">
                    <span className="text-xs text-foreground min-w-0 flex-1 truncate">
                      {opt.label}
                    </span>
                    <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden flex-shrink-0">
                      <div
                        className={cn('h-full rounded-full transition-all', scoreBarColor(score))}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={score}
                      onChange={(e) => onOptionScoreChange(opt.value, Number(e.target.value) || 0)}
                      className="w-16 h-7 text-xs text-center"
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Range buckets for number fields */}
          {hasRanges && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Score Ranges
              </p>
              {model!.ranges!.map((range, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={range.min}
                    onChange={(e) => onRangeChange(idx, 'min', Number(e.target.value))}
                    placeholder="Min"
                    className="w-20 h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="number"
                    value={range.max ?? ''}
                    onChange={(e) => onRangeChange(idx, 'max', e.target.value ? Number(e.target.value) : null)}
                    placeholder="Max (∞)"
                    className="w-20 h-7 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">=</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={range.points}
                    onChange={(e) => onRangeChange(idx, 'points', Number(e.target.value) || 0)}
                    className="w-16 h-7 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">pts</span>
                  <button
                    type="button"
                    onClick={() => onRemoveRange(idx)}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-destructive"
                  >
                    <Minus size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={onAddRange}
                className="text-xs text-primary font-medium hover:text-primary/80 flex items-center gap-1"
              >
                <Plus size={12} /> Add range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Scoring Tab ─────────────────────────────────────────────────────────

export function ScoringTab({
  config,
  slug,
  leadType,
  scoringModel,
  onScoringModelChange,
  onSave,
}: ScoringTabProps) {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Get all scorable questions
  const scorableQuestions = useMemo(() => {
    const qs: FormQuestion[] = [];
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (isScorableQuestion(q)) qs.push(q);
      }
    }
    return qs;
  }, [config]);

  // Non-scorable fields
  const nonScorableQuestions = useMemo(() => {
    const qs: FormQuestion[] = [];
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (!isScorableQuestion(q)) qs.push(q);
      }
    }
    return qs;
  }, [config]);

  // Total weight
  const totalWeight = useMemo(() => {
    if (!scoringModel) return 0;
    return Object.values(scoringModel.weights).reduce((sum, q) => sum + q.weight, 0);
  }, [scoringModel]);

  // ── Generate scoring model ─────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/form-config/generate-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, leadType, formConfig: config }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to generate scoring model');
      }
      const data = await res.json();
      onScoringModelChange(data.scoringModel);
      setHasUnsavedChanges(false);
      toast.success('Scoring model generated and saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate scoring model');
    } finally {
      setGenerating(false);
    }
  }, [slug, leadType, config, onScoringModelChange]);

  // ── Save scoring model ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!scoringModel) return;
    setSaving(true);
    try {
      await onSave(scoringModel);
      setHasUnsavedChanges(false);
      toast.success('Scoring model saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [scoringModel, onSave]);

  // ── Weight adjustment (redistributes) ──────────────────────────────────────

  const handleWeightChange = useCallback(
    (questionId: string, delta: number) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId]?.weight ?? 0;
      const newWeight = Math.max(0, Math.min(100, current + delta));
      const diff = newWeight - current;
      if (diff === 0) return;

      // Redistribute from/to other enabled questions
      const others = Object.entries(scoringModel.weights).filter(
        ([id, q]) => id !== questionId && q.weight > 0,
      );
      const othersTotal = others.reduce((s, [, q]) => s + q.weight, 0);

      const newWeights = { ...scoringModel.weights };
      newWeights[questionId] = { ...newWeights[questionId], weight: newWeight };

      if (othersTotal > 0 && diff !== 0) {
        let remaining = -diff;
        for (const [id, q] of others) {
          const proportion = q.weight / othersTotal;
          const adjustment = Math.round(remaining * proportion);
          newWeights[id] = { ...newWeights[id], weight: Math.max(0, q.weight + adjustment) };
        }
      }

      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Toggle question on/off ─────────────────────────────────────────────────

  const handleToggle = useCallback(
    (questionId: string) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      const isEnabled = current && current.weight > 0;

      const newWeights = { ...scoringModel.weights };

      if (isEnabled) {
        // Disable: set to 0, redistribute weight to others
        const freed = current.weight;
        newWeights[questionId] = { ...current, weight: 0 };

        const others = Object.entries(newWeights).filter(([id, q]) => id !== questionId && q.weight > 0);
        const othersTotal = others.reduce((s, [, q]) => s + q.weight, 0);

        if (othersTotal > 0) {
          let remaining = freed;
          for (const [id, q] of others) {
            const share = Math.round((q.weight / othersTotal) * freed);
            newWeights[id] = { ...q, weight: q.weight + share };
            remaining -= share;
          }
          // Give any rounding remainder to first
          if (remaining !== 0 && others.length > 0) {
            const [firstId, firstQ] = others[0];
            newWeights[firstId] = { ...firstQ, weight: (newWeights[firstId]?.weight ?? 0) + remaining };
          }
        }
      } else {
        // Enable: give a fair share from others
        const enabledCount = Object.values(newWeights).filter((q) => q.weight > 0).length;
        const fairShare = enabledCount > 0 ? Math.round(100 / (enabledCount + 1)) : 100;

        newWeights[questionId] = {
          weight: fairShare,
          optionScores: current?.optionScores,
          ranges: current?.ranges,
        };

        // Reduce others proportionally
        const others = Object.entries(newWeights).filter(([id, q]) => id !== questionId && q.weight > 0);
        const othersTotal = others.reduce((s, [, q]) => s + q.weight, 0);
        const targetOthersTotal = 100 - fairShare;

        if (othersTotal > 0) {
          for (const [id, q] of others) {
            newWeights[id] = { ...q, weight: Math.round((q.weight / othersTotal) * targetOthersTotal) };
          }
        }
      }

      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Option score change ────────────────────────────────────────────────────

  const handleOptionScoreChange = useCallback(
    (questionId: string, optValue: string, score: number) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current) return;
      const newOptScores = { ...(current.optionScores ?? {}), [optValue]: Math.max(0, Math.min(100, score)) };
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, optionScores: newOptScores },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Range changes ──────────────────────────────────────────────────────────

  const handleRangeChange = useCallback(
    (questionId: string, idx: number, field: keyof NumberRange, value: number | string | null) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current?.ranges) return;
      const newRanges = [...current.ranges];
      newRanges[idx] = { ...newRanges[idx], [field]: value };
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, ranges: newRanges },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  const handleAddRange = useCallback(
    (questionId: string) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current) return;
      const ranges = [...(current.ranges ?? [])];
      const lastMax = ranges.length > 0 ? (ranges[ranges.length - 1].max ?? 10000) : 0;
      ranges.push({ min: lastMax, max: null, points: 50, label: '' });
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, ranges },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  const handleRemoveRange = useCallback(
    (questionId: string, idx: number) => {
      if (!scoringModel) return;
      const current = scoringModel.weights[questionId];
      if (!current?.ranges) return;
      const newRanges = current.ranges.filter((_, i) => i !== idx);
      const newWeights = {
        ...scoringModel.weights,
        [questionId]: { ...current, ranges: newRanges },
      };
      onScoringModelChange({ ...scoringModel, weights: newWeights });
      setHasUnsavedChanges(true);
    },
    [scoringModel, onScoringModelChange],
  );

  // ── No model yet ───────────────────────────────────────────────────────────

  if (!scoringModel) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Sparkles size={32} className="mx-auto text-primary/60 mb-3" />
          <h3 className="text-sm font-semibold mb-1.5">Generate Scoring Model</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed mb-4">
            AI will analyze your form questions and create an optimal scoring model
            that automatically weights each question based on its importance for
            {leadType === 'rental' ? ' rental' : ' buyer'} lead qualification.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Generating...</>
            ) : (
              <><Sparkles size={14} className="mr-1.5" /> Generate Scoring Model</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ── Has model ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header: Total weight + actions */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Total Weight</span>
            <Badge
              variant={totalWeight === 100 ? 'secondary' : 'destructive'}
              className="text-[10px]"
            >
              {totalWeight === 100 ? (
                <><CheckCircle2 size={10} className="mr-1" /> {totalWeight}%</>
              ) : (
                <><AlertCircle size={10} className="mr-1" /> {totalWeight}%</>
              )}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                Unsaved
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={13} className="mr-1.5" />
              )}
              Regenerate
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasUnsavedChanges}
            >
              {saving ? (
                <Loader2 size={13} className="mr-1.5 animate-spin" />
              ) : (
                <Save size={13} className="mr-1.5" />
              )}
              Save
            </Button>
          </div>
        </div>
        {/* Segmented weight bar */}
        <div className="h-3 rounded-full bg-muted overflow-hidden flex">
          {scorableQuestions.map((q) => {
            const w = scoringModel.weights[q.id]?.weight ?? 0;
            if (w <= 0) return null;
            return (
              <div
                key={q.id}
                className={cn('h-full transition-all duration-300', weightBarColor(w))}
                style={{ width: `${w}%` }}
                title={`${q.label}: ${w}%`}
              />
            );
          })}
        </div>
      </div>

      {/* AI reasoning */}
      {scoringModel.reasoning && (
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/10 px-3 py-2.5">
          <Info size={14} className="text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs text-foreground/80 leading-relaxed">{scoringModel.reasoning}</p>
            {scoringModel.generatedAt && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Generated {formatTimeAgo(scoringModel.generatedAt)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Question cards */}
      <div className="space-y-2">
        {scorableQuestions.map((q) => {
          const model = scoringModel.weights[q.id];
          const enabled = model != null && model.weight > 0;
          return (
            <QuestionCard
              key={q.id}
              question={q}
              model={model}
              enabled={enabled}
              onToggle={() => handleToggle(q.id)}
              onWeightChange={(delta) => handleWeightChange(q.id, delta)}
              onOptionScoreChange={(optVal, score) => handleOptionScoreChange(q.id, optVal, score)}
              onRangeChange={(idx, field, val) => handleRangeChange(q.id, idx, field, val)}
              onAddRange={() => handleAddRange(q.id)}
              onRemoveRange={(idx) => handleRemoveRange(q.id, idx)}
            />
          );
        })}
      </div>

      {/* Not scored section */}
      {nonScorableQuestions.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Not Scored ({nonScorableQuestions.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {nonScorableQuestions.map((q) => (
              <Badge key={q.id} variant="outline" className="text-[10px] text-muted-foreground">
                {q.label}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
