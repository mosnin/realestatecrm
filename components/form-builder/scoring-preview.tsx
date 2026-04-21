'use client';

import { useState, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
} from 'lucide-react';
import type { IntakeFormConfig, FormQuestion } from './types';

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoreResult {
  scoringStatus: string;
  leadScore: number | null;
  scoreLabel: string;
  scoreSummary: string | null;
  scoreDetails: {
    score: number;
    priorityTier: string;
    confidence: number;
    summary: string;
    explanationTags: string[];
    strengths: string[];
    weaknesses: string[];
    riskFlags: string[];
    missingInformation: string[];
    recommendedNextAction: string;
  } | null;
}

// ── Score display helpers ────────────────────────────────────────────────────

function ScoreBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    hot: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    warm: 'bg-amber-100 text-amber-700 border-amber-200',
    cold: 'bg-blue-100 text-blue-700 border-blue-200',
    unscored: 'bg-gray-100 text-gray-500 border-gray-200',
  };
  const Icon = label === 'hot' ? TrendingUp : label === 'cold' ? TrendingDown : Minus;

  return (
    <Badge variant="outline" className={`${colors[label] ?? colors.unscored} gap-1`}>
      <Icon size={12} />
      {label.toUpperCase()}
    </Badge>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-emerald-500' : score >= 45 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.max(2, score)}%` }}
      />
    </div>
  );
}

// ── Question input renderer ──────────────────────────────────────────────────

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: FormQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  switch (question.type) {
    case 'select':
    case 'radio':
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={question.placeholder || 'Select...'} />
          </SelectTrigger>
          <SelectContent>
            {(question.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multi_select':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(question.options ?? []).map((opt) => {
            const selected = Array.isArray(value) && value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const current = Array.isArray(value) ? value : [];
                  const next = selected
                    ? current.filter((v) => v !== opt.value)
                    : [...current, opt.value];
                  onChange(next);
                }}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  selected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border hover:border-primary/40'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      );

    case 'textarea':
      return (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ''}
          className="min-h-[60px]"
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ''}
        />
      );

    case 'date':
      return (
        <Input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === 'true' || value === true as any}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            className="rounded"
          />
          <span className="text-xs text-muted-foreground">{question.description || 'Yes'}</span>
        </label>
      );

    default:
      return (
        <Input
          type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ''}
        />
      );
  }
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface ScoringPreviewProps {
  config: IntakeFormConfig;
  slug: string;
}

export function ScoringPreview({ config, slug }: ScoringPreviewProps) {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [scoreResult, setScoreResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evaluate section visibility based on current answers
  const isSectionVisible = useCallback((section: { visibleWhen?: { questionId: string; operator: 'equals' | 'not_equals' | 'contains'; value: string } }) => {
    if (!section.visibleWhen) return true;
    const { questionId, operator, value: targetValue } = section.visibleWhen;
    const currentAnswer = answers[questionId];
    const strAnswer = Array.isArray(currentAnswer) ? currentAnswer.join(',') : (currentAnswer ?? '');
    switch (operator) {
      case 'equals': return strAnswer === targetValue;
      case 'not_equals': return strAnswer !== targetValue;
      case 'contains': return strAnswer.includes(targetValue);
      default: return true;
    }
  }, [answers]);

  // Build list of all questions from visible sections
  const allQuestions = useMemo(() => {
    const qs: { question: FormQuestion; sectionTitle: string }[] = [];
    for (const section of config.sections) {
      for (const question of section.questions) {
        qs.push({ question, sectionTitle: section.title });
      }
    }
    return qs;
  }, [config]);

  // Visible sections for rendering
  const visibleSections = useMemo(() => {
    return config.sections.filter((s) => isSectionVisible(s));
  }, [config.sections, isSectionVisible]);

  const handleChange = useCallback((questionId: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setAnswers({});
    setScoreResult(null);
    setError(null);
  }, []);

  const handleRunScoring = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Build answers in the format the scoring API expects
      const formattedAnswers: Record<string, string | string[] | number | boolean> = {};
      for (const [key, val] of Object.entries(answers)) {
        if (val === '' || (Array.isArray(val) && val.length === 0)) continue;
        // Try to convert numbers
        const question = allQuestions.find((q) => q.question.id === key)?.question;
        if (question?.type === 'number' && typeof val === 'string') {
          formattedAnswers[key] = Number(val) || 0;
        } else if (question?.type === 'checkbox') {
          formattedAnswers[key] = val === 'true';
        } else {
          formattedAnswers[key] = val;
        }
      }

      const res = await fetch('/api/form-config/optimize/score-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          formConfig: config,
          answers: formattedAnswers,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Scoring failed (${res.status})`);
      }

      const data: ScoreResult = await res.json();
      setScoreResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed.');
    } finally {
      setLoading(false);
    }
  }, [answers, allQuestions, slug, config]);

  // Count filled answers
  const filledCount = Object.values(answers).filter(
    (v) => v !== '' && !(Array.isArray(v) && v.length === 0),
  ).length;

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-lg border border-border bg-muted/20 px-4 py-3">
        <p className="text-xs font-medium mb-1">Test how your form scores different applicants</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Fill in the fields below as if you were an applicant, then press <strong>Score This Applicant</strong> to see
          the lead score they would receive. This is a safe simulation -- nothing is saved and no real leads are affected.
        </p>
      </div>

      {/* Form questions (only from visible sections) */}
      <div className="space-y-6">
        {visibleSections.map((section) => (
          <div key={section.id}>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {section.title}
            </h4>
            <div className="space-y-4">
              {section.questions.map((question) => (
                <div key={question.id} className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    {question.label}
                    {question.required && <span className="text-red-500">*</span>}
                    {question.scoring?.weight ? (
                      <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1" title={`This question contributes ${question.scoring.weight} out of 10 toward the lead score`}>
                        Score weight: {question.scoring.weight}/10
                      </Badge>
                    ) : null}
                  </Label>
                  <QuestionInput
                    question={question}
                    value={answers[question.id] ?? (question.type === 'multi_select' ? [] : '')}
                    onChange={(val) => handleChange(question.id, val)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button onClick={handleRunScoring} disabled={loading || filledCount === 0}>
            {loading ? (
              <><Loader2 size={14} className="mr-1.5 animate-spin" /> Calculating score...</>
            ) : (
              <><Play size={14} className="mr-1.5" /> Score This Applicant</>
            )}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            <RotateCcw size={14} className="mr-1.5" /> Clear All
          </Button>
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filledCount === 0 ? (
            <span className="text-amber-600">Fill in at least one field to run scoring</span>
          ) : (
            <>{filledCount} of {allQuestions.length} fields filled</>
          )}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-700">Could not calculate the score</p>
            <p className="text-[11px] text-red-600/80 mt-0.5">{error}</p>
            <button
              type="button"
              onClick={handleRunScoring}
              className="text-[11px] text-red-600 hover:text-red-700 mt-1.5 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Score result */}
      {scoreResult && scoreResult.scoringStatus === 'scored' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Scoring Result
            </p>
          </div>
          <div className="p-4 space-y-4">
            {/* Score overview */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-3xl font-bold">{scoreResult.leadScore}</p>
                <p className="text-[10px] text-muted-foreground">out of 100</p>
              </div>
              <div className="flex-1 space-y-2">
                <ScoreBar score={scoreResult.leadScore ?? 0} />
                <div className="flex items-center gap-2">
                  <ScoreBadge label={scoreResult.scoreLabel} />
                  {scoreResult.scoreDetails?.confidence != null && (
                    <span className="text-[10px] text-muted-foreground" title="How confident the scoring model is in this result">
                      {Math.round(scoreResult.scoreDetails.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Summary */}
            {scoreResult.scoreSummary && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {scoreResult.scoreSummary}
              </p>
            )}

            {/* Details */}
            {scoreResult.scoreDetails && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {scoreResult.scoreDetails.strengths.length > 0 && (
                  <div>
                    <p className="font-semibold text-emerald-600 mb-1">Strengths</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {scoreResult.scoreDetails.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-500 flex-shrink-0 mt-0.5">+</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {scoreResult.scoreDetails.weaknesses.length > 0 && (
                  <div>
                    <p className="font-semibold text-amber-600 mb-1">Weaknesses</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {scoreResult.scoreDetails.weaknesses.map((w, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-500 flex-shrink-0 mt-0.5">-</span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {scoreResult.scoreDetails.riskFlags.length > 0 && (
                  <div>
                    <p className="font-semibold text-red-600 mb-1">Risk Flags</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {scoreResult.scoreDetails.riskFlags.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-red-500 flex-shrink-0 mt-0.5">!</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {scoreResult.scoreDetails.missingInformation.length > 0 && (
                  <div>
                    <p className="font-semibold text-blue-600 mb-1">Missing Information</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {scoreResult.scoreDetails.missingInformation.map((m, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-blue-500 flex-shrink-0 mt-0.5">?</span>
                          {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Tags */}
            {scoreResult.scoreDetails?.explanationTags && scoreResult.scoreDetails.explanationTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {scoreResult.scoreDetails.explanationTags.map((tag, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {/* Next action */}
            {scoreResult.scoreDetails?.recommendedNextAction && (
              <div className="rounded-md bg-muted/50 px-3 py-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">Recommended Action</p>
                <p className="text-xs mt-0.5">{scoreResult.scoreDetails.recommendedNextAction}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Failed result */}
      {scoreResult && scoreResult.scoringStatus === 'failed' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertCircle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-amber-700">Scoring could not be calculated</p>
            <p className="text-[11px] text-amber-600/80 mt-0.5 leading-relaxed">
              This usually means no scoring rules are set up yet. Go to the <strong>Builder</strong> tab,
              select a question, and add scoring weights and answer-score mappings. Then come back to test.
            </p>
            <button
              type="button"
              onClick={handleRunScoring}
              className="text-[11px] text-amber-600 hover:text-amber-700 mt-1.5 underline underline-offset-2"
            >
              Retry scoring
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
