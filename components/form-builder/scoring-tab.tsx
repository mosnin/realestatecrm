'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  RefreshCw,
  Sparkles,
  Info,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { IntakeFormConfig, FormQuestion } from './types';
import type { ScoringModel, NumberRange } from '@/lib/scoring/scoring-model-types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScoringTabProps {
  config: IntakeFormConfig;
  slug: string;
  scoringModel: ScoringModel | null;
  onScoringModelChange: (model: ScoringModel) => void;
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
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function getWeightColor(weight: number): string {
  if (weight >= 25) return 'bg-emerald-500';
  if (weight >= 15) return 'bg-emerald-400';
  if (weight >= 10) return 'bg-amber-400';
  if (weight >= 5) return 'bg-amber-300';
  return 'bg-gray-300';
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 50) return 'text-amber-600';
  if (score >= 20) return 'text-orange-500';
  return 'text-red-500';
}

// ── Weight Slider (HTML range input) ─────────────────────────────────────────

function WeightSlider({
  questionId,
  label,
  weight,
  onWeightChange,
}: {
  questionId: string;
  label: string;
  weight: number;
  onWeightChange: (id: string, newWeight: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium truncate max-w-[70%]">{label}</span>
        <span className={`text-xs font-bold tabular-nums ${getWeightColor(weight).replace('bg-', 'text-').replace('-500', '-700').replace('-400', '-600').replace('-300', '-500')}`}>
          {weight}%
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={weight}
          onChange={(e) => onWeightChange(questionId, parseInt(e.target.value, 10))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${weight}%, hsl(var(--muted)) ${weight}%, hsl(var(--muted)) 100%)`,
          }}
        />
      </div>
    </div>
  );
}

// ── Option Scores Table ──────────────────────────────────────────────────────

function OptionScoresEditor({
  questionId,
  question,
  optionScores,
  onOptionScoreChange,
}: {
  questionId: string;
  question: FormQuestion;
  optionScores: Record<string, number>;
  onOptionScoreChange: (questionId: string, optValue: string, score: number) => void;
}) {
  const options = question.options ?? [];
  if (options.length === 0) return null;

  return (
    <div className="ml-4 pl-4 border-l-2 border-muted space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Option Scores
      </p>
      {options.map((opt) => {
        const score = optionScores[opt.value] ?? 0;
        return (
          <div key={opt.value} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground truncate min-w-[100px] max-w-[160px]">
              {opt.label}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={score}
              onChange={(e) =>
                onOptionScoreChange(questionId, opt.value, parseInt(e.target.value, 10))
              }
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${score}%, hsl(var(--muted)) ${score}%, hsl(var(--muted)) 100%)`,
              }}
            />
            <span className={`text-[11px] font-mono w-8 text-right ${getScoreColor(score)}`}>
              {score}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Range Buckets Editor ─────────────────────────────────────────────────────

function RangeBucketsEditor({
  questionId,
  ranges,
  onRangeChange,
  onAddRange,
  onRemoveRange,
}: {
  questionId: string;
  ranges: NumberRange[];
  onRangeChange: (
    questionId: string,
    index: number,
    field: 'min' | 'max' | 'points' | 'label',
    value: number | string | null,
  ) => void;
  onAddRange: (questionId: string) => void;
  onRemoveRange: (questionId: string, index: number) => void;
}) {
  if (ranges.length === 0) return null;

  return (
    <div className="ml-4 pl-4 border-l-2 border-muted space-y-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Range Buckets
      </p>
      {ranges.map((range, i) => (
        <div key={i} className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground shrink-0">$</span>
          <Input
            type="number"
            value={range.min}
            onChange={(e) =>
              onRangeChange(questionId, i, 'min', parseInt(e.target.value, 10) || 0)
            }
            className="w-20 h-6 text-[11px] px-1.5"
          />
          <span className="text-muted-foreground shrink-0">to</span>
          <Input
            type="number"
            value={range.max ?? ''}
            placeholder="no limit"
            onChange={(e) => {
              const val = e.target.value;
              onRangeChange(
                questionId,
                i,
                'max',
                val === '' ? null : parseInt(val, 10) || 0,
              );
            }}
            className="w-20 h-6 text-[11px] px-1.5"
          />
          <span className="text-muted-foreground shrink-0 mx-1">=</span>
          <Input
            type="number"
            min={0}
            max={100}
            value={range.points}
            onChange={(e) =>
              onRangeChange(
                questionId,
                i,
                'points',
                Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)),
              )
            }
            className="w-14 h-6 text-[11px] px-1.5"
          />
          <span className="text-muted-foreground shrink-0">pts</span>
          {ranges.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveRange(questionId, i)}
              className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
              title="Remove range"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}
      {ranges.length < 8 && (
        <button
          type="button"
          onClick={() => onAddRange(questionId)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
        >
          <Plus size={11} /> Add range
        </button>
      )}
    </div>
  );
}

// ── Total Weight Bar ─────────────────────────────────────────────────────────

function TotalWeightBar({
  total,
  onRebalance,
}: {
  total: number;
  onRebalance: () => void;
}) {
  const isValid = total === 100;
  const barWidth = Math.min(100, total);
  const barColor = isValid
    ? 'bg-emerald-500'
    : total > 100
      ? 'bg-red-500'
      : 'bg-amber-500';

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Total Weight</span>
          {isValid ? (
            <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300 bg-emerald-50 gap-1">
              <CheckCircle2 size={10} /> 100%
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 gap-1">
              <AlertTriangle size={10} /> {total}%
            </Badge>
          )}
        </div>
        {!isValid && (
          <Button variant="outline" size="sm" onClick={onRebalance} className="h-6 text-[11px] px-2">
            <RefreshCw size={11} className="mr-1" /> Rebalance
          </Button>
        )}
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export function ScoringTab({
  config,
  slug,
  scoringModel,
  onScoringModelChange,
}: ScoringTabProps) {
  const [generating, setGenerating] = useState(false);

  // All scorable questions from the form config
  const scorableQuestions = useMemo(() => {
    const qs: { question: FormQuestion; sectionTitle: string }[] = [];
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (isScorableQuestion(q)) {
          qs.push({ question: q, sectionTitle: section.title });
        }
      }
    }
    return qs;
  }, [config]);

  // Non-scorable questions (system fields, etc.)
  const nonScorableQuestions = useMemo(() => {
    const qs: FormQuestion[] = [];
    for (const section of config.sections) {
      for (const q of section.questions) {
        if (!isScorableQuestion(q)) {
          qs.push(q);
        }
      }
    }
    return qs;
  }, [config]);

  // Compute current total weight
  const totalWeight = useMemo(() => {
    if (!scoringModel) return 0;
    return Object.values(scoringModel.weights).reduce((s, w) => s + w.weight, 0);
  }, [scoringModel]);

  // ── Generate / Regenerate ──────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/form-config/generate-scoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          leadType: config.leadType === 'general' ? 'rental' : config.leadType,
          formConfig: config,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate scoring model');
      }

      const { scoringModel: newModel } = await res.json();
      onScoringModelChange(newModel);
      toast.success('Scoring model generated successfully.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate scoring model');
    } finally {
      setGenerating(false);
    }
  }, [slug, config, onScoringModelChange]);

  // ── Weight Change (redistributes proportionally) ───────────────────────────

  const handleWeightChange = useCallback(
    (questionId: string, newWeight: number) => {
      if (!scoringModel) return;

      const currentWeights = { ...scoringModel.weights };
      const oldWeight = currentWeights[questionId]?.weight ?? 0;
      const diff = newWeight - oldWeight;

      if (diff === 0) return;

      // Set the new weight for the changed question
      currentWeights[questionId] = {
        ...currentWeights[questionId],
        weight: newWeight,
      };

      // Redistribute the difference across other questions proportionally
      const otherIds = Object.keys(currentWeights).filter((id) => id !== questionId);
      const otherTotal = otherIds.reduce((s, id) => s + (currentWeights[id]?.weight ?? 0), 0);

      if (otherTotal > 0 && diff !== 0) {
        let distributed = 0;
        for (let i = 0; i < otherIds.length; i++) {
          const id = otherIds[i];
          const proportion = (currentWeights[id]?.weight ?? 0) / otherTotal;
          const adjustment =
            i === otherIds.length - 1
              ? diff - distributed // last one gets remainder to avoid rounding issues
              : Math.round(diff * proportion);

          const newOtherWeight = Math.max(
            0,
            Math.min(100, (currentWeights[id]?.weight ?? 0) - adjustment),
          );
          currentWeights[id] = { ...currentWeights[id], weight: newOtherWeight };
          distributed += (currentWeights[id]?.weight ?? 0) + adjustment - newOtherWeight === 0
            ? adjustment
            : (scoringModel.weights[id]?.weight ?? 0) - newOtherWeight;
        }
      }

      onScoringModelChange({
        ...scoringModel,
        weights: currentWeights,
      });
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Option Score Change ────────────────────────────────────────────────────

  const handleOptionScoreChange = useCallback(
    (questionId: string, optValue: string, score: number) => {
      if (!scoringModel) return;

      const qModel = scoringModel.weights[questionId];
      if (!qModel) return;

      onScoringModelChange({
        ...scoringModel,
        weights: {
          ...scoringModel.weights,
          [questionId]: {
            ...qModel,
            optionScores: {
              ...(qModel.optionScores || {}),
              [optValue]: score,
            },
          },
        },
      });
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Range Change ───────────────────────────────────────────────────────────

  const handleRangeChange = useCallback(
    (
      questionId: string,
      index: number,
      field: 'min' | 'max' | 'points' | 'label',
      value: number | string | null,
    ) => {
      if (!scoringModel) return;

      const qModel = scoringModel.weights[questionId];
      if (!qModel?.ranges) return;

      const newRanges = [...qModel.ranges];
      newRanges[index] = { ...newRanges[index], [field]: value };

      onScoringModelChange({
        ...scoringModel,
        weights: {
          ...scoringModel.weights,
          [questionId]: { ...qModel, ranges: newRanges },
        },
      });
    },
    [scoringModel, onScoringModelChange],
  );

  const handleAddRange = useCallback(
    (questionId: string) => {
      if (!scoringModel) return;

      const qModel = scoringModel.weights[questionId];
      if (!qModel) return;

      const currentRanges = qModel.ranges || [];
      const lastRange = currentRanges[currentRanges.length - 1];
      const newMin = lastRange?.max ?? 0;

      onScoringModelChange({
        ...scoringModel,
        weights: {
          ...scoringModel.weights,
          [questionId]: {
            ...qModel,
            ranges: [
              ...currentRanges,
              { min: newMin, max: null, points: 100, label: `$${newMin.toLocaleString()}+` },
            ],
          },
        },
      });
    },
    [scoringModel, onScoringModelChange],
  );

  const handleRemoveRange = useCallback(
    (questionId: string, index: number) => {
      if (!scoringModel) return;

      const qModel = scoringModel.weights[questionId];
      if (!qModel?.ranges || qModel.ranges.length <= 1) return;

      const newRanges = qModel.ranges.filter((_, i) => i !== index);

      onScoringModelChange({
        ...scoringModel,
        weights: {
          ...scoringModel.weights,
          [questionId]: { ...qModel, ranges: newRanges },
        },
      });
    },
    [scoringModel, onScoringModelChange],
  );

  // ── Rebalance to 100 ──────────────────────────────────────────────────────

  const handleRebalance = useCallback(() => {
    if (!scoringModel) return;

    const entries = Object.entries(scoringModel.weights);
    const currentTotal = entries.reduce((s, [, w]) => s + w.weight, 0);
    if (currentTotal === 0 || currentTotal === 100) return;

    const factor = 100 / currentTotal;
    const scaled = entries.map(([id, w]) => ({
      id,
      weight: w.weight * factor,
      rest: w,
    }));

    const floored = scaled.map((s) => ({
      ...s,
      intWeight: Math.floor(s.weight),
      fraction: s.weight - Math.floor(s.weight),
    }));

    let rem = 100 - floored.reduce((s, f) => s + f.intWeight, 0);
    const sorted = [...floored].sort((a, b) => b.fraction - a.fraction);
    for (const item of sorted) {
      if (rem <= 0) break;
      item.intWeight += 1;
      rem -= 1;
    }

    const newWeights: ScoringModel['weights'] = {};
    for (const item of floored) {
      newWeights[item.id] = { ...item.rest, weight: item.intWeight };
    }

    onScoringModelChange({ ...scoringModel, weights: newWeights });
  }, [scoringModel, onScoringModelChange]);

  // ── Render: No model yet ───────────────────────────────────────────────────

  if (!scoringModel) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
          <Sparkles size={32} className="mx-auto text-muted-foreground mb-3" />
          <h3 className="text-sm font-semibold mb-1.5">No Scoring Model Yet</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed mb-4">
            Generate an AI-powered scoring model that automatically assigns optimal weights to each
            question based on your form structure and lead type. You can fine-tune the weights
            afterward.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" /> Generating scoring model...
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" /> Generate Scoring Model
              </>
            )}
          </Button>
        </div>

        {scorableQuestions.length > 0 && (
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {scorableQuestions.length} scorable question{scorableQuestions.length !== 1 ? 's' : ''} detected
            </p>
            <div className="space-y-1">
              {scorableQuestions.map(({ question }) => (
                <div key={question.id} className="text-xs text-muted-foreground flex items-center gap-2">
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                    {question.type}
                  </Badge>
                  {question.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Model exists ───────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-primary" />
            <span className="text-xs font-semibold">AI-Generated Scoring Model</span>
            <Badge variant="outline" className="text-[9px]">
              {scoringModel.leadType}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {scoringModel.generatedAt && (
              <span className="text-[10px] text-muted-foreground">
                Generated {formatTimeAgo(scoringModel.generatedAt)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="h-6 text-[11px] px-2"
            >
              {generating ? (
                <Loader2 size={11} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={11} className="mr-1" />
              )}
              Regenerate
            </Button>
          </div>
        </div>

        {/* Reasoning */}
        {scoringModel.reasoning && (
          <div className="px-4 py-2.5 border-b border-border bg-blue-50/50 flex items-start gap-2">
            <Info size={12} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-blue-700 leading-relaxed">{scoringModel.reasoning}</p>
          </div>
        )}
      </div>

      {/* Total Weight Bar */}
      <TotalWeightBar total={totalWeight} onRebalance={handleRebalance} />

      {/* Weight Sliders + Option/Range Editors */}
      <div className="space-y-5">
        {scorableQuestions.map(({ question, sectionTitle }) => {
          const qModel = scoringModel.weights[question.id];
          if (!qModel) {
            return (
              <div
                key={question.id}
                className="rounded-lg border border-dashed border-border px-4 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{question.label}</span>
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">
                      {question.type}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-muted-foreground italic">Not in model</span>
                </div>
              </div>
            );
          }

          return (
            <div
              key={question.id}
              className="rounded-lg border border-border bg-card px-4 py-3 space-y-3"
            >
              {/* Section label */}
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
                  {sectionTitle}
                </span>
                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                  {question.type}
                </Badge>
                {question.required && (
                  <span className="text-[9px] text-red-400">Required</span>
                )}
              </div>

              {/* Weight slider */}
              <WeightSlider
                questionId={question.id}
                label={question.label}
                weight={qModel.weight}
                onWeightChange={handleWeightChange}
              />

              {/* Option scores for radio/select */}
              {(question.type === 'radio' || question.type === 'select') &&
                qModel.optionScores && (
                  <OptionScoresEditor
                    questionId={question.id}
                    question={question}
                    optionScores={qModel.optionScores}
                    onOptionScoreChange={handleOptionScoreChange}
                  />
                )}

              {/* Range buckets for number fields */}
              {question.type === 'number' && qModel.ranges && qModel.ranges.length > 0 && (
                <RangeBucketsEditor
                  questionId={question.id}
                  ranges={qModel.ranges}
                  onRangeChange={handleRangeChange}
                  onAddRange={handleAddRange}
                  onRemoveRange={handleRemoveRange}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Non-scorable questions */}
      {nonScorableQuestions.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Not Scored
          </p>
          <div className="space-y-1">
            {nonScorableQuestions.map((q) => (
              <div key={q.id} className="text-[11px] text-muted-foreground flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                  {q.system ? 'system' : q.type}
                </Badge>
                {q.label}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
